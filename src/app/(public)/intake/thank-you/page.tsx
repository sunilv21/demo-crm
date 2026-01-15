
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { CheckCircle } from 'lucide-react';
import Link from 'next/link';

export default function ThankYouPage() {
  return (
    <div className="relative min-h-screen w-full">
       <div 
        className="fixed inset-0 bg-cover bg-center bg-fixed"
        style={{
            backgroundImage: `url('https://images.pexels.com/photos/21014/pexels-photo.jpg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2')`
        }}
      >
        <div className="absolute inset-0 bg-black/50" />
      </div>
      <div className="relative z-10 flex min-h-screen items-center justify-center bg-background/20 p-4">
        <Card className="w-full max-w-md text-center bg-card/60 backdrop-blur-sm">
          <CardHeader>
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mb-4">
                  <CheckCircle className="h-10 w-10 text-green-600" />
              </div>
            <CardTitle className="text-2xl">Thank You!</CardTitle>
            <CardDescription>
              Your travel inquiry has been successfully submitted. One of our travel experts will get in touch with you shortly.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/intake">Return to Inquiry Form</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
