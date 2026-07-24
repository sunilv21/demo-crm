# Inbox Feature Documentation

## Overview
The Inbox feature is a comprehensive email management system integrated into the CRM that allows users to read, manage, and synchronize emails from multiple connected mailboxes. It provides a unified interface for handling client communications directly within the CRM platform.

## Architecture

### Component Structure
```
src/app/(app)/inbox/
├── layout.tsx          # Role-based access control (admin, manager, agent)
└── page.tsx            # Main inbox page with tab navigation

src/components/settings/
└── inbox-tab.tsx       # Core inbox UI component (reused in both /inbox and /settings)

src/lib/
├── inbox-sync-core.ts  # Server-side sync logic for on-demand refresh
└── types.ts            # TypeScript type definitions (Mailbox, InboxMessage)

functions/src/
└── inbox-sync.ts       # Cloud Functions scheduled sync (every 5 minutes)
```

## Key Features

### 1. Multi-Mailbox Support
- **Multiple Email Accounts**: Connect and manage multiple email accounts (Gmail, Outlook, custom IMAP)
- **Mailbox Selection**: Dropdown to switch between connected mailboxes
- **Default Mailbox**: Automatically selects default or first available mailbox
- **Enable/Disable**: Mailboxes can be enabled or disabled without deletion

### 2. Email Synchronization
- **IMAP Protocol**: Uses IMAP to fetch emails from mailboxes
- **Two Sync Mechanisms**:
  - **Scheduled Sync**: Cloud Functions runs every 5 minutes (Asia/Kolkata timezone)
  - **On-Demand Sync**: Manual refresh button + auto-refresh every 1 minute when tab is open
- **Incremental Sync**: Only fetches new messages using UID tracking
- **First Sync Limit**: Initial sync fetches last 50 messages
- **Per-Run Limit**: Maximum 200 messages per sync run to prevent timeouts

### 3. Message Display
- **Message List**: Scrollable list showing sender, subject, and snippet
- **Read/Unread Status**: Visual indicators (bold text, background highlight) for unread messages
- **Attachment Indicators**: Paperclip icon shows messages with attachments
- **Message Detail View**: Full message rendering with HTML support
- **Sanitization**: DOMPurify sanitizes HTML content for security

### 4. Message Content
- **Dual Format**: Stores both plain text and HTML versions
- **Body Capping**: 
  - Text body capped at 20,000 characters
  - HTML body capped at 50,000 characters
  - Truncation indicator when content is capped
- **Snippet Generation**: Auto-generates 200-character snippet for preview
- **Attachment Metadata**: Stores filename, size, and content type (not actual files)

### 5. User Interactions
- **Auto-Mark Read**: Messages automatically marked as read when opened
- **Manual Refresh**: Button to trigger immediate sync
- **Auto-Refresh**: Background refresh every 60 seconds when tab is active
- **Silent Auto-Refresh**: Background sync doesn't show toast notifications to prevent spam

## Data Models

### Mailbox Type
```typescript
type Mailbox = {
  id: string;
  email: string;
  displayName: string;
  provider: 'gmail' | 'outlook' | 'custom';
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  // Encrypted credentials
  passwordCiphertext: string;
  passwordIv: string;
  passwordAuthTag: string;
  passwordKeyVersion: number;
  isDefault: boolean;
  isEnabled: boolean;
  // Sync state tracking
  lastTestedAt?: Timestamp;
  lastTestStatus?: 'success' | 'failed' | null;
  lastTestError?: string | null;
  lastSyncedAt?: Timestamp;
  lastSeenUid?: number | null;
  lastSeenUidValidity?: number | null;
  syncState: 'idle' | 'syncing' | 'error';
  syncError?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
  updatedBy: string;
};
```

### InboxMessage Type
```typescript
type InboxMessage = {
  id: string;                    // Format: {mailboxId}_{uidValidity}_{uid}
  mailboxId: string;
  mailboxEmail: string;
  folder: string;                // Currently only 'INBOX'
  uid: number;                   // IMAP UID
  uidValidity: number;           // IMAP UIDVALIDITY
  messageIdHeader?: string;
  from: { name: string; address: string };
  to: { name: string; address: string }[];
  subject: string;
  snippet: string;               // 200-character preview
  bodyText: string;              // Plain text body (capped at 20k chars)
  bodyHtml?: string | null;      // HTML body (capped at 50k chars)
  bodyTruncated?: boolean;       // Flag if content was capped
  hasAttachments: boolean;
  attachmentsMeta?: { filename: string; size: number; contentType: string }[];
  date: Timestamp;
  isRead: boolean;               // Synced from IMAP \Seen flag
  syncedAt: Timestamp;
};
```

## Firestore Collections

### mailboxes
- **Purpose**: Stores email account configurations
- **Security**: Client-side read-only, all writes through API routes
- **Encryption**: Passwords encrypted with AES-256-GCM
- **Access**: Admin-only for configuration, readable by authenticated users

### inbox_messages
- **Purpose**: Stores synchronized email messages
- **Document ID**: `{mailboxId}_{uidValidity}_{uid}` (deterministic, prevents duplicates)
- **Query**: Indexed by `mailboxId` and `date` for efficient retrieval
- **Access**: Readable by authenticated users, written by sync processes

## Sync Mechanism Details

### Scheduled Sync (Cloud Functions)
- **Location**: `functions/src/inbox-sync.ts`
- **Trigger**: Every 5 minutes (cron schedule)
- **Region**: us-central1
- **Concurrency**: Processes up to 3 mailboxes simultaneously
- **Error Handling**: Logs errors, updates mailbox syncState to 'error'

### On-Demand Sync (API Route)
- **Location**: `src/lib/inbox-sync-core.ts`
- **Trigger**: Manual refresh button + auto-refresh in UI
- **Endpoint**: `/api/settings/mailboxes/[id]/sync`
- **Response**: Returns `{ ok: boolean, newCount: number, error?: string }`

### Sync Logic Flow
1. **Lock Acquisition**: Uses IMAP mailbox lock to prevent concurrent syncs
2. **UIDVALIDITY Check**: Detects mailbox rebuilds, resets sync if changed
3. **Range Calculation**: 
   - First sync: Last 50 messages by sequence number
   - Subsequent sync: Messages with UID > lastSeenUid
4. **Message Fetching**: Iterates through messages with concurrency limit
5. **Parsing**: Uses `mailparser` to parse email source
6. **Capping**: Applies body size limits
7. **Firestore Write**: Upserts message by deterministic document ID
8. **State Update**: Updates mailbox lastSeenUid, syncState, lastSyncedAt

## Security Features

### Credential Encryption
- **Algorithm**: AES-256-GCM
- **Implementation**: `src/lib/mailbox-crypto.ts`
- **Storage**: Never stores plaintext passwords
- **Key Management**: Uses Firebase Secrets for encryption key

### Access Control
- **Route Protection**: `RequireRole` component limits access to admin, manager, agent
- **Firestore Rules**: Client-side read-only for mailboxes collection
- **API Routes**: Server-side validation and encryption handling
- **Admin-Only Configuration**: Email account setup restricted to admin role

### Content Sanitization
- **HTML Sanitization**: DOMPurify removes malicious scripts from email HTML
- **XSS Prevention**: All rendered HTML is sanitized before display

## UI Components

### Inbox Tab (`inbox-tab.tsx`)
- **Mailbox Selector**: Dropdown to choose active mailbox
- **Refresh Button**: Manual sync trigger with loading state
- **Message List**: 
  - Scrollable area with 520px height
  - Loading skeletons during sync
  - Visual indicators for unread and attachments
- **Message Detail**:
  - Two-column layout (list + detail)
  - Full message rendering
  - Attachment metadata display
  - Truncation warnings

### Page Layout (`inbox/page.tsx`)
- **Tab Navigation**: Inbox, Sent, Campaigns, Analytics, Templates, Accounts
- **Notification Dots**: Shows unseen message indicators
- **Role-Based Content**: Accounts tab restricted to admin users
- **Auto-Clear Notifications**: Marks tabs as seen when activated

## Integration Points

### Firebase Integration
- **Firestore**: Data persistence for mailboxes and messages
- **Authentication**: User authentication and role-based access
- **Real-time Updates**: Uses `useCollection` hook for live message updates

### Email Integration
- **IMAP Client**: Uses `imapflow` library for email fetching
- **SMTP Client**: Uses `nodemailer` for sending (via `mail-transport.ts`)
- **Email Parsing**: Uses `mailparser` for MIME parsing

### CRM Integration
- **Client Linking**: Messages can be related to clients (via EmailLog)
- **Campaign Integration**: Sent emails tracked in campaign system
- **Notification System**: Integrates with notification provider for alerts

## Performance Considerations

### Sync Optimization
- **Incremental Sync**: Only fetches new messages using UID tracking
- **Concurrency Limits**: Prevents server overload (3 concurrent mailboxes)
- **Message Limits**: Caps per-run sync to prevent timeouts
- **Body Capping**: Limits storage size and processing time

### UI Performance
- **Lazy Loading**: Messages loaded on-demand per mailbox
- **Skeleton Screens**: Loading states during sync
- **Efficient Queries**: Indexed Firestore queries by mailboxId and date
- **Non-Blocking Updates**: Uses `setDocumentNonBlocking` for read status

## Error Handling

### Sync Errors
- **State Tracking**: Mailbox syncState set to 'error' on failure
- **Error Messages**: Stored in mailbox.syncError field
- **Silent Failures**: Auto-refresh failures logged to console, not toasted
- **Manual Failures**: Manual refresh failures shown as toast notifications

### Connection Errors
- **IMAP Connection Failures**: Caught and logged, syncState updated
- **Decryption Failures**: Handled with user-friendly error messages
- **Network Issues**: Timeout handling and retry logic

## Configuration

### Mailbox Presets
- **Location**: `src/lib/mailbox-presets.ts`
- **Providers**: Gmail, Outlook, custom IMAP configurations
- **Auto-Fill**: Pre-fills common IMAP/SMTP settings for known providers

### Environment Variables
- **Firebase Configuration**: Required for Firestore and Authentication
- **Encryption Key**: Stored in Firebase Secrets for password encryption
- **Timezone**: Scheduled sync uses Asia/Kolkata timezone

## Future Enhancements
- **Folder Support**: Extend beyond INBOX to other IMAP folders
- **Attachment Download**: Store and serve actual attachment files
- **Message Actions**: Reply, forward, delete functionality
- **Search**: Full-text search across messages
- **Filters**: Filter by sender, date, attachments, read status
- **Labels/Tags**: Custom categorization of messages
- **Threaded View**: Group messages by conversation

## Troubleshooting

### Sync Not Working
1. Check mailbox `isEnabled` flag is true
2. Verify IMAP credentials are correct
3. Check `syncState` and `syncError` fields in mailbox document
4. Ensure Cloud Functions scheduler is running
5. Review Firebase Functions logs for errors

### Messages Not Appearing
1. Verify mailbox is selected in dropdown
2. Check Firestore security rules
3. Ensure user has appropriate role (admin/manager/agent)
4. Review browser console for errors
5. Check network connectivity

### Performance Issues
1. Reduce FIRST_SYNC_MESSAGE_LIMIT if initial sync is slow
2. Check mailbox size and consider archiving old emails
3. Verify Firestore indexes are created for queries
4. Monitor Cloud Functions execution time

## Dependencies
- **imapflow**: IMAP client library
- **mailparser**: Email MIME parsing
- **isomorphic-dompurify**: HTML sanitization
- **firebase-admin**: Admin Firebase SDK for server operations
- **lucide-react**: UI icons

## Related Documentation
- Email Accounts Setup: See Accounts tab in Inbox page
- Campaign Management: See Campaigns tab for bulk email sending
- Email Templates: See Templates tab for reusable email content
- Audit Log: See Audit Log tab for admin action tracking
