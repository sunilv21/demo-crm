'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function SignUpPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/login');
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center h-full text-white">
        <Loader2 className="mr-2 h-8 w-8 animate-spin" />
        <p className="mt-2">Redirecting to login...</p>
    </div>
  );
}
