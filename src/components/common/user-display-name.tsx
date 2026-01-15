'use client';

import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import type { User as AppUser } from '@/lib/types';
import { doc } from 'firebase/firestore';

export function UserDisplayName({ userId }: { userId: string }) {
    const firestore = useFirestore();

    const userDocRef = useMemoFirebase(() => {
        if (!firestore || !userId) return null;
        return doc(firestore, 'users', userId);
    }, [firestore, userId]);

    const { data: user, isLoading } = useDoc<AppUser>(userDocRef);

    if (isLoading) {
        return <span className="text-sm text-muted-foreground">Loading...</span>;
    }

    if (!user) {
        return <span className="text-sm text-muted-foreground italic">{userId.slice(0,8)}...</span>;
    }

    return <>{user.name}</>;
}
