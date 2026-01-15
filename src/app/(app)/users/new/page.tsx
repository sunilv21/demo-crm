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
        role: 'employee', // Default role
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
            The new user will be created with the role of 'Employee' and will receive an email to set their password.
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
