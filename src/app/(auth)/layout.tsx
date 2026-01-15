'use client';

import Image from 'next/image';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      
      {/* Desktop Background */}
      <div className="fixed inset-0 -z-20 hidden sm:block">
        <Image
          src="https://images.pexels.com/photos/35548535/pexels-photo-35548535.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2"
          alt="Travel background"
          fill
          priority
          className="object-cover"
        />
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      </div>

      {/* Mobile Background */}
      <div
        className="fixed inset-0 -z-20 block bg-cover bg-center bg-no-repeat sm:hidden"
        style={{
          backgroundImage:
            "url('https://images.pexels.com/photos/2531237/pexels-photo-2531237.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2')",
        }}
      >
        <div className="absolute inset-0 bg-black/60" />
      </div>

      {/* Subtle Grid Overlay */}
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(to_right,#ffffff1a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff1a_1px,transparent_1px)] bg-[size:32px_32px] opacity-20" />

      {/* Content */}
      <div className="relative z-10 container mx-auto flex min-h-screen items-center justify-center px-4">
        <div className="grid w-full max-w-6xl grid-cols-1 items-center gap-10 md:grid-cols-2">

          {/* LEFT: Auth Content */}
          <div className="flex flex-col items-start text-white">
            <h1 className="text-4xl font-bold tracking-tight">
              Welcome to Sky Visa CRM
            </h1>
            <p className="mt-2 max-w-md text-white/80">
              Your all-in-one solution for managing travel clients.
            </p>

            <div className="mt-8 w-full max-w-md">
              {children}
            </div>
          </div>

          {/* RIGHT: Logo */}
          <div className="hidden md:flex items-center justify-center">
            <div className="relative">
              <div className="absolute -inset-1/2 rounded-full bg-gradient-to-tr from-blue-400 via-sky-300 to-teal-200 opacity-50 blur-3xl" />
              <Image
                src="/favicon.ico"
                alt="Sky Visa"
                width={480}
                height={260}
                priority
                className="object-contain opacity-90"
              />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
