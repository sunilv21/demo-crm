# Sky Visa CRM - Database Schema Documentation

**Database:** Firebase Firestore (NoSQL Document Database)  
**Project:** Sky Visa CRM  
**Schema Version:** 1.0  
**Last Updated:** July 9, 2026

---

## Database Overview

**Technology:** Firebase Firestore (NoSQL Document Database)  
**Data Model:** Document-based with subcollections  
**Real-time:** Yes (real-time listeners supported)  
**Offline Support:** Yes (with IndexedDB persistence)

**Database Characteristics:**
- Schemaless (flexible document structure)
- Scalable (automatic scaling)
- Real-time synchronization
- Offline-first capabilities
- Strong consistency within documents
- Eventual consistency across collections

---

## Collection Structure

### 1. Users Collection

**Collection Path:** `users/{userId}`  
**Purpose:** Store user profiles and authentication data

#### Document Schema

```typescript
{
  id: string                    // User ID (string, matches document ID)
  name: string                  // Full name (string, required, max 200 chars)
  email: string                 // Email address (string, required, valid email format)
  phone?: string                // Phone number (string, optional, E.164 format)
  jobTitle?: string             // Job title (string, optional)
  avatar?: string               // Avatar URL (string, optional, URL)
  role: string                  // User role (string, enum: 'employee' | 'manager' | 'admin' | 'agent')
  baseSalary?: number           // Base salary (number, optional, decimal)
  workStartTime?: string       // Work start time (string, optional, format: "HH:MM")
  workEndTime?: string         // Work end time (string, optional, format: "HH:MM")
  lateGraceMinutes?: number     // Late grace minutes (number, optional, integer)
  monthlyLeaveCap?: number      // Monthly leave cap (number, optional, integer)
  dailyBreakCapMinutes?: number // Daily break cap minutes (number, optional, integer)
  createdAt: Timestamp          // Creation timestamp (Firestore Timestamp)
  updatedAt: Timestamp          // Last update timestamp (Firestore Timestamp)
  createdBy: string             // Creator user ID (string, required)
  updatedBy: string             // Last updater user ID (string, required)
}
```

#### Indexes Required
- None (queries by ID only)

#### Security Rules
- Read: All signed-in users
- Create: Self-create only
- Update: Self-update (except role, salary, work times - admin only)
- Delete: Admin only

---

### 2. Clients Collection

**Collection Path:** `clients/{clientId}`  
**Purpose:** Store client/customer information

#### Document Schema

```typescript
{
  id: string                              // Client ID (string, matches document ID)
  name: string                            // Full name (string, required, 2-200 chars)
  organizationId?: string                 // Organization ID (string, optional, references organizations)
  email?: string                          // Email address (string, optional, valid email format)
  phone: string                           // Phone number (string, required, E.164 format)
  avatar: string                          // Avatar URL (string, required, URL or empty string)
  preferences: string                     // Preferences (string, required)
  status: string                          // Client status (string, enum: 'active' | 'inactive' | 'lead' | 'prospect')
  dateOfBirth?: string                    // Date of birth (string, optional, ISO date format)
  gender?: string                         // Gender (string, optional, enum: 'male' | 'female' | 'other')
  nationality?: string                    // Nationality (string, optional, country code)
  preferredDestination?: string           // Preferred destination (string, optional)
  travelPurpose?: string                  // Travel purpose (string, optional)
  preferredTravelDates?: {               // Preferred travel dates (object, optional)
    from?: string                         // Start date (string, optional, ISO date format)
    to?: string                           // End date (string, optional, ISO date format)
  }
  tripDestinations?: [{                   // Trip destinations (array of objects, optional)
    destination?: string                  // Destination (string, optional)
    from?: string                         // Start date (string, optional, ISO date format)
    to?: string                           // End date (string, optional, ISO date format)
  }]
  budget?: number                         // Budget (number, optional, decimal)
  hotelPreference?: string                // Hotel preference (string, optional)
  services?: string[]                     // Services (array of strings, optional, enum: 'flight' | 'hotel' | 'visa' | 'transfers' | 'activity' | 'localTours')
  additionalServices?: string[]           // Additional services (array of strings, optional, enum: 'travelInsurance' | 'airportPickup' | 'localTours')
  assignedEmployees?: string[]            // Assigned employee IDs (array of strings, optional, user IDs)
  visaStatus?: string                     // Visa status (string, optional, enum: 'toStart' | 'inProcess' | 'applied' | 'approved' | 'rejected' | 'completed' | 'travelling')
  visaHistory?: [{                        // Visa history (array of objects, optional)
    country: string                       // Country (string, required)
    status: string                        // Status (string, enum: 'approved' | 'rejected')
    date: string                          // Date (string, required, ISO date format)
    rejectionReason?: string              // Rejection reason (string, optional)
  }]
  previousTrips?: [{                      // Previous trips (array of objects, optional)
    country: string                       // Country (string, required)
    startDate: string                     // Start date (string, required, ISO date format)
    endDate: string                       // End date (string, required, ISO date format)
  }]
  requiredDocuments?: [{                  // Required documents (array of objects, optional)
    name: string                          // Document name (string, required)
    status: string                        // Status (string, enum: 'pending' | 'uploaded' | 'verified' | 'received')
  }]
  followUpDate?: string                   // Follow-up date (string, optional, ISO date format)
  pax?: number                           // Number of passengers (number, optional, integer, default: 1)
  companions?: [{                         // Companions (array of objects, optional)
    name: string                          // Name (string, required)
    type?: string                         // Type (string, optional, enum: 'adult' | 'child' | 'infant')
  }]
  createdAt: Timestamp                    // Creation timestamp (Firestore Timestamp)
  updatedAt: Timestamp                    // Last update timestamp (Firestore Timestamp)
  createdBy: string                       // Creator user ID (string, required)
  updatedBy: string                       // Last updater user ID (string, required)
}
```

#### Subcollections

**`clients/{clientId}/itineraries/{itineraryId}`**
- Itinerary documents for client trips

#### Indexes Required
- Composite: `assignedEmployees` (array-contains) + `status` (asc) + `createdAt` (desc)
- Composite: `createdBy` (asc) + `createdAt` (desc)
- Composite: `status` (asc) + `createdAt` (desc)

#### Security Rules
- Read: Signed-in users (assignedEmployees or createdBy or admin/manager)
- Create: Signed-in users or public form (with validation)
- Update: Signed-in users (assignedEmployees or createdBy or admin/manager)
- Delete: Admin/Manager only

---

### 3. Bookings Collection

**Collection Path:** `bookings/{bookingId}`  
**Purpose:** Store booking information

#### Document Schema

```typescript
{
  id: string                              // Booking ID (string, matches document ID)
  clientId: string                       // Client ID (string, required, references clients)
  clientName: string                      // Client name (string, required, denormalized)
  bookingType: string                    // Booking type (string, enum: 'flight' | 'hotel' | 'car' | 'activity' | 'visa' | 'other')
  destination?: string                    // Destination (string, optional)
  
  // Flight-specific fields
  isOneWay?: boolean                     // One-way flight (boolean, optional)
  hasLayover?: boolean                   // Has layover (boolean, optional)
  layoverAirport?: string                 // Layover airport (string, optional)
  isMultiCity?: boolean                   // Multi-city flight (boolean, optional)
  sectors?: [{                            // Flight sectors (array of objects, optional)
    origin?: string                       // Origin airport (string, optional)
    destination?: string                  // Destination airport (string, optional)
    departure?: string                    // Departure date/time (string, optional, ISO format)
    cabinClass?: string                   // Cabin class (string, optional)
    flightNumber?: string                 // Flight number (string, optional)
    airportCode?: string                  // Airport code (string, optional)
  }]
  
  // Visa applicants
  visaApplicants?: [{                     // Visa applicants (array of objects, optional)
    name?: string                         // Name (string, optional)
    passportNumber?: string               // Passport number (string, optional)
    validFrom?: string                    // Valid from date (string, optional, ISO date format)
    validUntil?: string                   // Valid until date (string, optional, ISO date format)
  }]
  
  // Hotel guests
  hotelGuests?: [{                        // Hotel guests (array of objects, optional)
    name?: string                         // Name (string, optional)
  }]
  
  bookingPortal?: string                  // Booking portal (string, optional)
  startDate: string                      // Start date (string, required, ISO date format)
  endDate: string                        // End date (string, required, ISO date format)
  status: string                         // Booking status (string, enum: 'draft' | 'pending' | 'hold' | 'confirmed' | 'cancelled')
  progress: number                       // Progress (number, required, 0-100)
  
  // Financials
  total: number                           // Total amount (number, required, decimal)
  amountPaid?: number                    // Amount paid (number, optional, decimal)
  balanceAmount?: number                 // Balance amount (number, optional, decimal)
  paymentStatus?: string                 // Payment status (string, optional, enum: 'unpaid' | 'partial' | 'paid' | 'refunded')
  payments?: [{                           // Payments (array of objects, optional)
    id: string                            // Payment ID (string, required)
    amount: number                        // Amount (number, required, decimal)
    date: string                          // Payment date (string, required, ISO date format)
    mode: string                          // Payment mode (string, enum: 'cash' | 'card' | 'upi' | 'bank' | 'cheque' | 'other')
    reference?: string                    // Reference (string, optional)
    note?: string                         // Note (string, optional)
    createdAt?: Timestamp                // Creation timestamp (Firestore Timestamp, optional)
    createdBy?: string                    // Creator user ID (string, optional)
    createdByName?: string                // Creator name (string, optional)
  }]
  
  // Supplier information
  supplierName?: string                   // Supplier name (string, optional)
  supplierCost?: number                   // Supplier cost (number, optional, decimal)
  supplierReference?: string              // Supplier reference (string, optional)
  profit?: number                         // Profit (number, optional, decimal, calculated: total - supplierCost)
  
  // Generic data
  bookingDetails?: Record<string, any>    // Additional booking details (object, optional, flexible schema)
  
  // Documents
  documents?: [{                          // Documents (array of objects, optional)
    name: string                          // Document name (string, required)
    url?: string                          // Document URL (string, optional)
    uploadedAt?: Timestamp                // Upload timestamp (Firestore Timestamp, optional)
  }]
  
  remarks?: string                        // Remarks (string, optional)
  
  // Archival
  archived?: boolean                      // Archived flag (boolean, optional)
  archivedAt?: Timestamp                  // Archive timestamp (Firestore Timestamp, optional)
  archiveExempt?: boolean                 // Archive exempt flag (boolean, optional)
  
  // Timeline
  timeline?: [{                           // Timeline events (array of objects, optional)
    action: string                        // Action (string, required)
    userId: string                        // User ID (string, required)
    userName: string                      // User name (string, required)
    createdAt: Timestamp                  // Timestamp (Firestore Timestamp, required)
  }]
  
  createdAt: Timestamp                    // Creation timestamp (Firestore Timestamp)
  updatedAt: Timestamp                    // Last update timestamp (Firestore Timestamp)
  createdBy: string                       // Creator user ID (string, required)
  updatedBy: string                       // Last updater user ID (string, required)
}
```

#### Indexes Required
- Composite: `clientId` (asc) + `status` (asc) + `startDate` (desc)
- Composite: `createdBy` (asc) + `createdAt` (desc)
- Composite: `status` (asc) + `startDate` (desc)

#### Security Rules
- Read: Signed-in users (createdBy or client assigned or admin/manager)
- Create: Signed-in users
- Update: Signed-in users (createdBy or client assigned or admin/manager)
- Delete: Admin/Manager only

---

### 4. Invoices Collection

**Collection Path:** `invoices/{invoiceId}`  
**Purpose:** Store invoice information

#### Document Schema

```typescript
{
  id: string                              // Invoice ID (string, matches document ID)
  bookingId: string                       // Booking ID (string, required, references bookings)
  clientName: string                      // Client name (string, required, denormalized)
  amount: number                          // Invoice amount (number, required, decimal)
  dueDate: string                         // Due date (string, required, ISO date format)
  status: string                          // Invoice status (string, enum: 'paid' | 'unpaid' | 'overdue')
  createdAt: Timestamp                    // Creation timestamp (Firestore Timestamp)
  updatedAt: Timestamp                    // Last update timestamp (Firestore Timestamp)
  createdBy: string                       // Creator user ID (string, required)
  updatedBy: string                       // Last updater user ID (string, required)
}
```

#### Indexes Required
- Composite: `bookingId` (asc)
- Composite: `status` (asc) + `dueDate` (asc)

#### Security Rules
- Read: Admin/Manager only
- Write: Admin only

---

### 5. Leads Collection

**Collection Path:** `leads/{leadId}`  
**Purpose:** Store lead information

#### Document Schema

```typescript
{
  id: string                              // Lead ID (string, matches document ID)
  name: string                            // Name (string, required, 1-200 chars)
  email?: string                          // Email address (string, optional, valid email format)
  phone: string                           // Phone number (string, required, 0-40 chars)
  avatar: string                          // Avatar URL (string, required)
  status: string                          // Lead status (string, enum: 'new' | 'contacted' | 'proposal' | 'won' | 'lost')
  source?: string                         // Lead source (string, optional)
  
  // Additional lead details
  nationality?: string                    // Nationality (string, optional)
  preferredDestination?: string           // Preferred destination (string, optional)
  travelPurpose?: string                  // Travel purpose (string, optional)
  preferredTravelDates?: {               // Preferred travel dates (object, optional)
    from?: string                         // Start date (string, optional, ISO date format)
    to?: string                           // End date (string, optional, ISO date format)
  }
  budget?: number                         // Budget (number, optional, decimal)
  pax?: number                           // Number of passengers (number, optional, integer)
  notes?: string                         // Notes (string, optional)
  
  // Conversion tracking
  convertedToClientId?: string            // Converted client ID (string, optional, references clients)
  convertedAt?: Timestamp                  // Conversion timestamp (string, optional)
  
  // Website lead fields
  destination?: string                    // Destination (string, optional, from website)
  message?: string                        // Message (string, optional, from website)
  rawPayload?: Record<string, any>        // Raw payload (object, optional, from website)
  localRef?: {                            // Local reference (object, optional)
    collection: string                     // Collection name (string, required)
    id: string                            // Document ID (string, required)
  } | null
  sourceWebsite?: string                  // Source website (string, optional)
  phoneDigits?: string                    // Phone digits (string, optional)
  phoneSuffix10?: string                  // Phone suffix (string, optional)
  
  createdAt: Timestamp                    // Creation timestamp (Firestore Timestamp)
  updatedAt: Timestamp                    // Last update timestamp (Firestore Timestamp)
  createdBy: string                       // Creator user ID (string, required)
  updatedBy: string                       // Last updater user ID (string, required)
}
```

#### Indexes Required
- Composite: `status` (asc) + `createdAt` (desc)
- Composite: `source` (asc) + `createdAt` (desc)

#### Security Rules
- Read: Signed-in users
- Create: Signed-in users or public form (with validation)
- Update: Signed-in users
- Delete: Admin/Manager only

---

### 6. Organizations Collection

**Collection Path:** `organizations/{organizationId}`  
**Purpose:** Store corporate organization information

#### Document Schema

```typescript
{
  id: string                              // Organization ID (string, matches document ID)
  name: string                            // Organization name (string, required)
  type: string                            // Organization type (string, enum: 'corporate')
  contactPerson?: string                  // Contact person (string, optional)
  email?: string                          // Email address (string, optional, valid email format)
  phone?: string                          // Phone number (string, optional)
  gstNumber?: string                      // GST number (string, optional)
  billingAddress?: string                 // Billing address (string, optional)
  notes?: string                          // Notes (string, optional)
  createdAt: Timestamp                    // Creation timestamp (Firestore Timestamp)
  updatedAt: Timestamp                    // Last update timestamp (Firestore Timestamp)
  createdBy: string                       // Creator user ID (string, required)
  updatedBy: string                       // Last updater user ID (string, required)
}
```

#### Indexes Required
- None (queries by ID only)

#### Security Rules
- Read: Signed-in users
- Create: Signed-in users
- Update: Signed-in users
- Delete: Admin/Manager only

---

### 7. Customer Logs Collection

**Collection Path:** `customer_logs/{logId}`  
**Purpose:** Store customer activity logs

#### Document Schema

```typescript
{
  id: string                              // Log ID (string, matches document ID)
  clientId: string                        // Client ID (string, required, references clients)
  clientName?: string                     // Client name (string, optional, denormalized)
  userName?: string                       // User name (string, optional, denormalized)
  activity: string                        // Activity description (string, required)
  userId: string                          // User ID (string, required, references users)
  createdAt: Timestamp                    // Creation timestamp (Firestore Timestamp)
  updatedAt: Timestamp                    // Last update timestamp (Firestore Timestamp)
  createdBy: string                       // Creator user ID (string, required)
  updatedBy: string                       // Last updater user ID (string, required)
}
```

#### Indexes Required
- Composite: `clientId` (asc) + `createdAt` (desc)
- Composite: `userId` (asc) + `createdAt` (desc)

#### Security Rules
- Read: Signed-in users
- Create: Signed-in users
- Update: Signed-in users
- Delete: Admin/Manager only

---

### 8. Follow Ups Collection

**Collection Path:** `follow_ups/{followUpId}`  
**Purpose:** Store follow-up tasks

#### Document Schema

```typescript
{
  id: string                              // Follow-up ID (string, matches document ID)
  clientId: string                        // Client ID (string, required, references clients)
  clientName: string                      // Client name (string, required, denormalized)
  clientEmail?: string                    // Client email (string, optional, denormalized)
  clientPhone?: string                    // Client phone (string, optional, denormalized)
  date: string                            // Follow-up date (string, required, ISO date format)
  notes: string | null                    // Notes (string or null, required)
  done: boolean                           // Completion status (boolean, required)
  priority: string                        // Priority (string, enum: 'low' | 'medium' | 'high')
  createdAt: Timestamp                    // Creation timestamp (Firestore Timestamp)
  updatedAt: Timestamp                    // Last update timestamp (Firestore Timestamp)
  createdBy: string                       // Creator user ID (string, required)
  updatedBy: string                       // Last updater user ID (string, required)
}
```

#### Indexes Required
- Composite: `clientId` (asc) + `date` (desc)
- Composite: `done` (asc) + `date` (asc)

#### Security Rules
- Read: Signed-in users
- Create: Signed-in users
- Update: Signed-in users
- Delete: Admin/Manager only

---

### 9. Attendance Collection

**Collection Path:** `attendance/{attendanceId}`  
**Purpose:** Store employee attendance records

#### Document Schema

```typescript
{
  id: string                              // Attendance ID (string, format: "{userId}_{YYYY-MM-DD}")
  userId: string                          // User ID (string, required, references users)
  userName: string                        // User name (string, required, denormalized)
  date: string                            // Date (string, required, format: "YYYY-MM-DD")
  punchIn: Timestamp                      // Punch-in timestamp (Firestore Timestamp, required)
  punchOut?: Timestamp                    // Punch-out timestamp (Firestore Timestamp, optional)
  workStartTime: string                    // Work start time (string, required, format: "HH:MM")
  workEndTime: string                      // Work end time (string, required, format: "HH:MM")
  lateGraceMinutes: number                 // Late grace minutes (number, required, integer)
  punchInLate: boolean                    // Punch-in late flag (boolean, required)
  punchOutEarly: boolean                  // Punch-out early flag (boolean, required)
  autoLoggedOut: boolean                  // Auto-logged out flag (boolean, required)
  workMinutes?: number                    // Work minutes (number, optional, integer)
  status: string                          // Attendance status (string, enum: 'present' | 'late' | 'half-day' | 'absent' | 'leave' | 'holiday' | 'upcoming')
  notes?: string                          // Notes (string, optional)
  
  // Break tracking
  breaks?: [{                             // Breaks (array of objects, optional)
    id: string                            // Break ID (string, required, UUID)
    start: Timestamp                      // Break start timestamp (Firestore Timestamp, required)
    end?: Timestamp                        // Break end timestamp (Firestore Timestamp, optional)
    source: string                         // Break source (string, enum: 'manual' | 'screen-lock' | 'personal')
    durationMinutes?: number               // Duration minutes (number, optional, integer)
  }]
  breakMinutes?: number                    // Total break minutes (number, optional, integer)
  activeMinutes?: number                   // Active work minutes (number, optional, integer)
  lastActiveAt?: Timestamp                // Last active timestamp (Firestore Timestamp, optional)
  
  createdAt: Timestamp                    // Creation timestamp (Firestore Timestamp)
  updatedAt: Timestamp                    // Last update timestamp (Firestore Timestamp)
}
```

#### Indexes Required
- Composite: `userId` (asc) + `date` (asc)

#### Security Rules
- Get: Admin or owner (by path or userId)
- List: Admin or owner (where userId == uid)
- Create: Admin or owner (deterministic ID)
- Update: Admin or owner (punchIn, date locked)
- Delete: Admin only

---

### 10. Leaves Collection

**Collection Path:** `leaves/{leaveId}`  
**Purpose:** Store employee leave requests

#### Document Schema

```typescript
{
  id: string                              // Leave ID (string, matches document ID)
  userId: string                          // User ID (string, required, references users)
  userName: string                        // User name (string, required, denormalized)
  type: string                            // Leave type (string, enum: 'casual' | 'sick' | 'earned' | 'lop')
  startDate: string                       // Start date (string, required, ISO date format)
  endDate: string                         // End date (string, required, ISO date format)
  days: number                            // Number of days (number, required, integer)
  reason: string                          // Reason (string, required)
  status: string                          // Leave status (string, enum: 'pending' | 'approved' | 'rejected')
  approvedBy?: string                     // Approver user ID (string, optional)
  approvedAt?: Timestamp                   // Approval timestamp (Firestore Timestamp, optional)
  rejectedBy?: string                     // Rejecter user ID (string, optional)
  rejectedAt?: Timestamp                   // Rejection timestamp (Firestore Timestamp, optional)
  rejectionReason?: string                 // Rejection reason (string, optional)
  createdAt: Timestamp                    // Creation timestamp (Firestore Timestamp)
  updatedAt: Timestamp                    // Last update timestamp (Firestore Timestamp)
}
```

#### Indexes Required
- Composite: `userId` (asc) + `startDate` (desc)
- Composite: `status` (asc) + `createdAt` (desc)

#### Security Rules
- Read: Signed-in users
- Create: Signed-in users (self, pending status)
- Update: Admin or self (pending status, cannot flip status)
- Delete: Admin or self (pending status only)

---

### 11. Holidays Collection

**Collection Path:** `holidays/{holidayId}`  
**Purpose:** Store company holidays

#### Document Schema

```typescript
{
  id: string                              // Holiday ID (string, matches document ID)
  date: string                            // Holiday date (string, required, format: "YYYY-MM-DD")
  name: string                            // Holiday name (string, required)
  createdAt: Timestamp                    // Creation timestamp (Firestore Timestamp)
  createdBy: string                       // Creator user ID (string, required)
}
```

#### Indexes Required
- Composite: `date` (asc)

#### Security Rules
- Read: Signed-in users
- Write: Admin only

---

### 12. Process Tracking Collection

**Collection Path:** `process_tracking/{trackingId}`  
**Purpose:** Store process tracking information

#### Document Schema

```typescript
{
  id: string                              // Tracking ID (string, matches document ID)
  // Flexible schema based on process type
  // Fields vary by process being tracked
  createdAt: Timestamp                    // Creation timestamp (Firestore Timestamp)
  updatedAt: Timestamp                    // Last update timestamp (Firestore Timestamp)
}
```

#### Indexes Required
- None (flexible schema)

#### Security Rules
- Read: Signed-in users
- Create: Signed-in users
- Update: Signed-in users
- Delete: Admin/Manager only

---

### 13. Customer Statuses Collection

**Collection Path:** `customer_statuses/{statusId}`  
**Purpose:** Store customer status definitions

#### Document Schema

```typescript
{
  id: string                              // Status ID (string, matches document ID)
  // Status definition fields
  // Read-only collection
}
```

#### Indexes Required
- None (read-only)

#### Security Rules
- Read: Signed-in users
- Write: False (read-only)

---

### 14. Roles Collection

**Collection Path:** `roles/{roleId}`  
**Purpose:** Store role definitions

#### Document Schema

```typescript
{
  id: string                              // Role ID (string, matches document ID)
  // Role definition fields
  // Read-only collection
}
```

#### Indexes Required
- None (read-only)

#### Security Rules
- Read: Signed-in users
- Write: False (read-only)

---

### 15. Audit Logs Collection

**Collection Path:** `audit_logs/{auditLogId}`  
**Purpose:** Store security audit logs

#### Document Schema

```typescript
{
  id: string                              // Audit log ID (string, matches document ID)
  action: string                          // Action performed (string, required)
  userId: string                          // User ID (string, required)
  userEmail?: string                      // User email (string, optional)
  userName?: string                       // User name (string, optional)
  resourceType?: string                   // Resource type (string, optional)
  resourceId?: string                     // Resource ID (string, optional)
  changes?: Record<string, any>           // Changes made (object, optional)
  ipAddress?: string                      // IP address (string, optional)
  userAgent?: string                      // User agent (string, optional)
  success: boolean                        // Success flag (boolean, required)
  errorMessage?: string                   // Error message (string, optional)
  timestamp: Timestamp                    // Timestamp (Firestore Timestamp, required)
}
```

#### Indexes Required
- Composite: `userId` (asc) + `timestamp` (desc)
- Composite: `action` (asc) + `timestamp` (desc)
- Composite: `resourceType` (asc) + `resourceId` (asc) + `timestamp` (desc)

#### Security Rules
- Read: Admin only
- Write: System only (via backend functions)

---

### 16. Error Logs Collection

**Collection Path:** `error_logs/{errorLogId}`  
**Purpose:** Store application error logs

#### Document Schema

```typescript
{
  id: string                              // Error log ID (string, matches document ID)
  message: string                         // Error message (string, required)
  code: string                            // Error code (string, required)
  stack?: string                          // Stack trace (string, optional)
  userId?: string                         // User ID (string, optional)
  route?: string                          // Route (string, optional)
  userAgent?: string                      // User agent (string, optional)
  details?: Record<string, any>           // Additional details (object, optional)
  timestamp: Timestamp                    // Timestamp (Firestore Timestamp, required)
  resolved: boolean                       // Resolved flag (boolean, required)
}
```

#### Indexes Required
- Composite: `resolved` (asc) + `timestamp` (desc)
- Composite: `code` (asc) + `timestamp` (desc)

#### Security Rules
- Read: Admin only
- Write: System only (via error handler)

---

### 17. Login Attempts Collection

**Collection Path:** `login_attempts/{email}`  
**Purpose:** Track failed login attempts for account lockout

#### Document Schema

```typescript
{
  id: string                              // Email address (string, used as document ID)
  count: number                           // Failed attempt count (number, required, integer)
  lastAttempt: Timestamp                  // Last attempt timestamp (Firestore Timestamp, required)
  lockedUntil?: Timestamp                 // Lockout expiration (Firestore Timestamp, optional)
}
```

#### Indexes Required
- None (queries by email only)

#### Security Rules
- Read: System only
- Write: System only (via auth functions)

---

## Data Type Reference

### Firestore Data Types Used

| Type | Description | Example |
|------|-------------|---------|
| **string** | Text data | "John Doe" |
| **number** | Numeric data (double precision) | 1234.56 |
| **boolean** | True/false values | true |
| **Timestamp** | Date/time data | Timestamp from serverTimestamp() |
| **array** | List of values | ["flight", "hotel"] |
| **object** | Key-value pairs | { from: "2026-01-01", to: "2026-01-10" |
| **null** | Null value | null |
| **geopoint** | Geographic coordinates | GeoPoint(40.7128, -74.0060) |
| **reference** | Document reference | doc("users/abc123") |

### Custom Type Definitions

#### Enums Used

**User Roles:**
- `employee` - Regular employee
- `manager` - Manager with elevated permissions
- `admin` - Administrator with full access
- `agent` - Agent with limited permissions

**Client Status:**
- `active` - Active client
- `inactive` - Inactive client
- `lead` - Lead/prospect
- `prospect` - Potential client

**Booking Status:**
- `draft` - Draft booking
- `pending` - Pending confirmation
- `hold` - On hold
- `confirmed` - Confirmed booking
- `cancelled` - Cancelled booking

**Payment Status:**
- `unpaid` - Not paid
- `partial` - Partially paid
- `paid` - Fully paid
- `refunded` - Refunded

**Lead Status:**
- `new` - New lead
- `contacted` - Contacted
- `proposal` - Proposal sent
- `won` - Converted to client
- `lost` - Lost lead

**Leave Type:**
- `casual` - Casual leave
- `sick` - Sick leave
- `earned` - Earned leave
- `lop` - Loss of pay

**Attendance Status:**
- `present` - Present
- `late` - Late
- `half-day` - Half day
- `absent` - Absent
- `leave` - On leave
- `holiday` - Holiday
- `upcoming` - Upcoming

**Visa Status:**
- `toStart` - Not started
- `inProcess` - In process
- `applied` - Applied
- `approved` - Approved
- `rejected` - Rejected
- `completed` - Completed
- `travelling` - Travelling

### Date/Time Formats

**ISO 8601 Format:**
- Dates: `YYYY-MM-DD` (e.g., "2026-07-09")
- DateTimes: `YYYY-MM-DDTHH:mm:ss.sssZ` (e.g., "2026-07-09T10:30:00.000Z")

**Time Format:**
- Times: `HH:MM` (e.g., "09:30", "18:30")

### Phone Number Format

**E.164 Format:**
- Format: `+[country code][number]`
- Example: `+919876543210`

### Email Format

**Standard Email Format:**
- Format: `local@domain.com`
- Example: `user@example.com`

---

## Relationships

### Document Relationships

**One-to-Many:**
- User → Attendance (userId)
- User → Leaves (userId)
- User → Bookings (createdBy)
- Client → Bookings (clientId)
- Client → Customer Logs (clientId)
- Client → Follow Ups (clientId)
- Organization → Clients (organizationId)
- Booking → Invoices (bookingId)

**Many-to-Many:**
- Client ↔ User (assignedEmployees array)
- Booking ↔ Payment (payments array)

**Self-Referential:**
- Lead → Client (convertedToClientId)

---

## Index Strategy

### Composite Indexes

**Required for efficient queries:**

1. **Clients Collection:**
   - `assignedEmployees` (array-contains) + `status` (asc) + `createdAt` (desc)
   - `createdBy` (asc) + `createdAt` (desc)

2. **Bookings Collection:**
   - `clientId` (asc) + `status` (asc) + `startDate` (desc)
   - `createdBy` (asc) + `createdAt` (desc)

3. **Invoices Collection:**
   - `bookingId` (asc)
   - `status` (asc) + `dueDate` (asc)

4. **Follow Ups Collection:**
   - `clientId` (asc) + `date` (desc)
   - `done` (asc) + `date` (asc)

5. **Customer Logs Collection:**
   - `clientId` (asc) + `createdAt` (desc)
   - `userId` (asc) + `createdAt` (desc)

6. **Attendance Collection:**
   - `userId` (asc) + `date` (asc)

7. **Leaves Collection:**
   - `userId` (asc) + `startDate` (desc)
   - `status` (asc) + `createdAt` (desc)

---

## Security Rules Summary

### Access Control Matrix

| Collection | Read | Create | Update | Delete |
|------------|------|--------|--------|--------|
| users | Signed-in | Self | Self/Admin | Admin |
| clients | Assigned/Created | Signed-in/Public | Assigned/Created/Admin | Admin/Manager |
| bookings | Created/Assigned | Signed-in | Created/Assigned/Admin | Admin/Manager |
| invoices | Admin/Manager | Admin | Admin | Admin |
| leads | Signed-in | Signed-in/Public | Signed-in | Admin/Manager |
| organizations | Signed-in | Signed-in | Signed-in | Admin/Manager |
| customer_logs | Signed-in | Signed-in | Signed-in | Admin/Manager |
| follow_ups | Signed-in | Signed-in | Signed-in | Admin/Manager |
| attendance | Owner/Admin | Owner/Admin | Owner/Admin | Admin |
| leaves | Signed-in | Self (pending) | Self/Admin | Self/Admin |
| holidays | Signed-in | Admin | Admin | Admin |
| process_tracking | Signed-in | Signed-in | Signed-in | Admin/Manager |
| audit_logs | Admin | System | System | System |
| error_logs | Admin | System | System | System |

---

## Data Validation Rules

### Required Fields

**Users:**
- id, name, email, role, createdAt, createdBy

**Clients:**
- id, name, phone, avatar, preferences, status, createdAt, createdBy

**Bookings:**
- id, clientId, clientName, bookingType, startDate, endDate, status, progress, total, createdAt, createdBy

**Invoices:**
- id, bookingId, clientName, amount, dueDate, status, createdAt, createdBy

**Leads:**
- id, name, phone, avatar, status, createdAt, createdBy

**Organizations:**
- id, name, type, createdAt, createdBy

**Attendance:**
- id, userId, userName, date, punchIn, workStartTime, workEndTime, lateGraceMinutes, punchInLate, punchOutEarly, autoLoggedOut, status, createdAt

**Leaves:**
- id, userId, userName, type, startDate, endDate, days, reason, status, createdAt

**Holidays:**
- id, date, name, createdAt, createdBy

### Field Constraints

**String Lengths:**
- User name: max 200 characters
- Client name: 2-200 characters
- Lead name: 1-200 characters
- Lead phone: 0-40 characters

**Number Ranges:**
- Booking progress: 0-100
- Attendance work minutes: non-negative integer
- Leave days: positive integer

**Enum Values:**
- All enum fields must use predefined values only

---

## Best Practices

### Document Size Limits

- **Maximum document size:** 1 MB
- **Recommended document size:** < 100 KB
- **Large arrays:** Consider subcollections for > 100 items

### Query Optimization

- Use selective field retrieval (projection)
- Limit query results with pagination
- Use composite indexes for complex queries
- Avoid array-contains with large arrays

### Data Consistency

- Use transactions for multi-document operations
- Implement optimistic concurrency control
- Use serverTimestamp() for consistent timestamps
- Denormalize frequently accessed data

### Performance Considerations

- Batch writes for multiple documents
- Use offline persistence for better UX
- Implement caching for frequently accessed data
- Monitor query performance with Firestore metrics

---

## Migration Notes

### Schema Evolution

**Adding Fields:**
- New fields can be added without breaking existing code
- Use optional fields for backward compatibility

**Removing Fields:**
- Deprecated fields should be marked in documentation
- Consider data migration before removal

**Changing Field Types:**
- Requires data migration
- Test thoroughly in staging environment

### Data Cleanup

**Archival Strategy:**
- Archive old bookings (15 days after payment)
- Archive completed follow-ups
- Clean up old audit logs (90-day retention)

**Backup Strategy:**
- Daily automated backups
- 30-day retention
- Verification of backup integrity

---

**Document Version:** 1.0  
**Last Updated:** July 9, 2026  
**Maintained By:** Development Team
