'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth, useFirestore, useUser, setDocumentNonBlocking } from '@/firebase';
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, updateProfile } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { doc, serverTimestamp } from 'firebase/firestore';

const formSchema = z.object({
  name: z.string().min(2, { message: 'Name is required.' }),
  email: z.string().email({ message: 'Please enter a valid email.' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
  role: z.enum(['employee', 'manager', 'admin', 'agent']),
  baseSalary: z.coerce.number().min(0).optional(),
  workStartTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  workEndTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  lateGraceMinutes: z.coerce.number().min(0).max(120).optional(),
  monthlyLeaveCap: z.coerce.number().min(0).max(31).optional(),
  dailyBreakCapMinutes: z.coerce.number().min(0).max(480).optional(),
});

export default function NewUserPage() {
  const mainAuth = useAuth();
  const firestore = useFirestore();
  const { user: adminUser } = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      role: 'employee',
      baseSalary: 0,
      workStartTime: '09:30',
      workEndTime: '18:30',
      lateGraceMinutes: 15,
      monthlyLeaveCap: 2,
      dailyBreakCapMinutes: 40,
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!adminUser || !firestore) {
        toast({
            variant: 'destructive',
            title: 'Error',
            description: 'You must be logged in to create a new user.',
        });
        return;
    }
    
    setIsLoading(true);
    
    // We can't use the main auth instance directly, as it would sign out the admin.
    // So, we create a temporary, secondary app instance to handle the new user creation.
    const { initializeApp, getApps, deleteApp } = await import('firebase/app');
    const { getAuth: getAuth_local } = await import('firebase/auth');
    const { firebaseConfig } = await import('@/firebase/config');
    
    const tempAppName = `temp-signup-app-${Date.now()}`;
    const tempApp = initializeApp(firebaseConfig, tempAppName);
    const tempAuth = getAuth_local(tempApp);

    try {
      const userCredential = await createUserWithEmailAndPassword(tempAuth, values.email, values.password);
      const newUser = userCredential.user;

      // 1. Update the new user's Auth profile
      await updateProfile(newUser, { displayName: values.name });

      // 2. Create the user document in Firestore
      const userDocRef = doc(firestore, 'users', newUser.uid);
      await setDocumentNonBlocking(userDocRef, {
        id: newUser.uid,
        name: values.name,
        email: values.email,
        role: values.role,
        baseSalary: values.baseSalary ?? 0,
        workStartTime: values.workStartTime ?? '09:30',
        workEndTime: values.workEndTime ?? '18:30',
        lateGraceMinutes: values.lateGraceMinutes ?? 15,
        monthlyLeaveCap: values.monthlyLeaveCap ?? 2,
        dailyBreakCapMinutes: values.dailyBreakCapMinutes ?? 40,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: adminUser.uid,
        updatedBy: adminUser.uid,
      }, {});

      // 3. Send a password reset email so they can set their own password
      await sendPasswordResetEmail(mainAuth, values.email);

      toast({
        title: 'User Created Successfully',
        description: `${values.name}'s account has been created. A password setup email has been sent to ${values.email}.`,
      });
      
      form.reset(); // Clear the form for the next entry
      
    } catch (error: any) {
      console.error('User Creation Error:', error);
      toast({
        variant: 'destructive',
        title: 'User Creation Failed',
        description: error.code === 'auth/email-already-in-use' 
            ? 'This email address is already in use by another account.'
            : error.message || 'An unexpected error occurred. Please try again.',
      });
    } finally {
      // 4. Clean up the temporary app instance
      await signOut(tempAuth);
      await deleteApp(tempApp);
      setIsLoading(false);
    }
  }

  return (
    <>
        <PageHeader title="Create New User" description="Add a new employee to the system." />
        <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
            <CardTitle>New User Details</CardTitle>
            <CardDescription>
            The new user will receive an email to set their password.
            </CardDescription>
        </CardHeader>
        <CardContent>
            <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                        <Input placeholder="e.g. Jane Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                        <Input placeholder="e.g. jane.doe@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Temporary Password</FormLabel>
                    <FormControl>
                        <Input type="password" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a role" />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            <SelectItem value="employee">Employee</SelectItem>
                            <SelectItem value="agent">Agent</SelectItem>
                            <SelectItem value="manager">Manager</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                    </Select>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField
                control={form.control}
                name="baseSalary"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Base Monthly Salary (₹)</FormLabel>
                    <FormControl>
                        <Input type="number" min={0} step={500} {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                  control={form.control}
                  name="workStartTime"
                  render={({ field }) => (
                      <FormItem>
                      <FormLabel>Shift Start</FormLabel>
                      <FormControl>
                          <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                      </FormItem>
                  )}
                  />
                  <FormField
                  control={form.control}
                  name="workEndTime"
                  render={({ field }) => (
                      <FormItem>
                      <FormLabel>Shift End</FormLabel>
                      <FormControl>
                          <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                      </FormItem>
                  )}
                  />
                  <FormField
                  control={form.control}
                  name="lateGraceMinutes"
                  render={({ field }) => (
                      <FormItem>
                      <FormLabel>Grace (min)</FormLabel>
                      <FormControl>
                          <Input type="number" min={0} max={120} {...field} />
                      </FormControl>
                      <FormMessage />
                      </FormItem>
                  )}
                  />
                </div>
                <FormField
                control={form.control}
                name="monthlyLeaveCap"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Monthly Leave Cap</FormLabel>
                    <FormControl>
                        <Input type="number" min={0} max={31} {...field} />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Approved leaves beyond this count in a month will be marked as Absent and deducted.
                    </p>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField
                control={form.control}
                name="dailyBreakCapMinutes"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Daily Break Cap (minutes)</FormLabel>
                    <FormControl>
                        <Input type="number" min={0} max={480} step={5} {...field} />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Total break time allowed per day (manual + screen-lock). Excess deducted from active work in payroll. Set 0 to disable cap.
                    </p>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create User
                </Button>
            </form>
            </Form>
        </CardContent>
        </Card>
    </>
  );
}
