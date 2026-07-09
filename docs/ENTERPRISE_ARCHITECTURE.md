# Sky Visa CRM - Enterprise Architecture Document

**Document Version:** 1.0  
**Project:** Sky Visa CRM  
**Document Type:** Enterprise Architecture  
**Target Audience:** Architects, Senior Developers, DevOps Engineers, Technical Leadership  
**Last Updated:** July 9, 2026  
**Document Length:** Comprehensive (80-120 pages equivalent)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Overview](#system-overview)
3. [Architecture Principles](#architecture-principles)
4. [Technology Stack](#technology-stack)
5. [ER Diagrams and Firestore Hierarchy](#er-diagrams-and-firestore-hierarchy)
6. [Collection Relationships](#collection-relationships)
7. [Domain-Driven Design (DDD)](#domain-driven-design-ddd)
8. [Module-by-Module Database Schemas](#module-by-module-database-schemas)
9. [Security Rules Architecture](#security-rules-architecture)
10. [Index Strategy and Optimization](#index-strategy-and-optimization)
11. [Cost Optimization Strategies](#cost-optimization-strategies)
12. [Caching Strategy](#caching-strategy)
13. [Backup and Archival Plan](#backup-and-archival-plan)
14. [Multi-Tenant Migration Path](#multi-tenant-migration-path)
15. [API Architecture](#api-architecture)
16. [Event-Driven Workflow Design](#event-driven-workflow-design)
17. [Scalability Architecture](#scalability-architecture)
18. [Monitoring and Observability](#monitoring-and-observability)
19. [Disaster Recovery](#disaster-recovery)
20. [Compliance and Governance](#compliance-and-governance)
21. [Future Roadmap](#future-roadmap)
22. [Conclusion](#conclusion)

---

## Executive Summary

### Document Purpose

This Enterprise Architecture Document provides a comprehensive technical blueprint for the Sky Visa CRM system, a complex multi-domain application integrating Travel Management, Visa Processing, Customer Relationship Management (CRM), Human Resources (HR), Finance, and Collections functionality.

### System Scope

The Sky Visa CRM is a single-tenant (with multi-tenant migration path) travel agency management system that handles:

- **Travel Management:** Flight bookings, hotel reservations, car rentals, activities
- **Visa Processing:** Visa applications, document tracking, embassy coordination
- **CRM:** Lead management, customer tracking, follow-ups, communication
- **HR:** Employee management, attendance tracking, leave management
- **Finance:** Invoicing, payments, profit tracking, accounting
- **Collections:** Payment collection, debt management, reconciliation

### Architecture Highlights

- **Database:** Firebase Firestore (NoSQL) with 17+ collections
- **Frontend:** Next.js 16 with React 19, TypeScript 5
- **Backend:** Firebase Functions with serverless architecture
- **Real-time:** Firestore real-time listeners for live updates
- **Offline:** IndexedDB persistence for offline functionality
- **Security:** Firebase Authentication + Firestore Security Rules
- **Scalability:** Serverless architecture with auto-scaling capabilities

### Key Architectural Decisions

1. **NoSQL Database:** Chosen for flexibility in evolving travel industry requirements
2. **Serverless Backend:** Reduces operational overhead and provides auto-scaling
3. **Real-time First:** Enables collaborative features and live updates
4. **Offline-First:** Critical for travel agents working in connectivity-challenged environments
5. **Modular Design:** Domain-driven design approach for maintainability

### Migration Readiness

The architecture is designed with multi-tenant migration in mind, including:
- Tenant-aware data modeling patterns
- Isolation strategies (database vs. schema-based)
- Migration pathways with zero-downtime considerations
- Cost optimization for multi-tenant scenarios

---

## System Overview

### Business Context

Sky Visa CRM serves travel agencies by providing a unified platform to manage:
- Customer relationships from lead to conversion
- Travel bookings across multiple service types
- Visa processing workflows
- Employee operations and HR management
- Financial operations and collections
- Business intelligence and reporting

### System Boundaries

**In-Scope:**
- Travel agency operations management
- Customer lifecycle management
- Booking and reservation management
- Visa application processing
- Employee management and attendance
- Financial operations
- Reporting and analytics

**Out-of-Scope:**
- Direct GDS integration (future phase)
- Payment gateway integration (future phase)
- Multi-tenant SaaS operations (future phase)
- Mobile applications (future phase)
- AI-powered recommendations (future phase)

### Stakeholders

**Primary Users:**
- Travel Agents
- Sales Managers
- Operations Managers
- Finance Managers
- HR Managers
- Administrators

**Secondary Users:**
- Customers (via self-service portal)
- Suppliers (via integration)
- Partners (via API)

### Non-Functional Requirements

**Performance:**
- Page load time < 2 seconds (p95)
- API response time < 500ms (p95)
- Support 100+ concurrent users
- 99.5% uptime SLA

**Security:**
- Role-based access control (RBAC)
- Data encryption at rest and in transit
- Audit logging for all critical operations
- Compliance with data protection regulations

**Scalability:**
- Horizontal scaling capability
- Support 10,000+ customers
- Support 100,000+ bookings
- Support 50+ employees

**Reliability:**
- Automated daily backups
- 30-day data retention
- Disaster recovery plan
- Error rate < 1%

---

## Architecture Principles

### 1. Modularity

**Principle:** The system is organized into cohesive, loosely coupled modules based on business domains.

**Implementation:**
- Domain-driven design (DDD) boundaries
- Clear separation of concerns
- Independent module deployment capability
- Minimal inter-module dependencies

**Benefits:**
- Easier maintenance
- Parallel development
- Independent scaling
- Clear ownership

### 2. Scalability

**Principle:** The architecture supports horizontal scaling and can handle growth in users, data, and traffic.

**Implementation:**
- Serverless backend (Firebase Functions)
- Auto-scaling database (Firestore)
- Stateless application design
- Efficient query patterns with indexes

**Benefits:**
- Automatic scaling
- Cost efficiency
- No capacity planning required
- Handles traffic spikes

### 3. Reliability

**Principle:** The system maintains availability and data integrity even in the face of failures.

**Implementation:**
- Automated backup systems
- Error handling and retry logic
- Offline persistence
- Data validation at multiple layers

**Benefits:**
- High availability
- Data protection
- Graceful degradation
- Quick recovery

### 4. Security

**Principle:** Security is built into every layer of the architecture.

**Implementation:**
- Defense in depth approach
- Least privilege access
- Comprehensive audit logging
- Regular security reviews

**Benefits:**
- Data protection
- Regulatory compliance
- Risk mitigation
- Trust assurance

### 5. Maintainability

**Principle:** The codebase and architecture are designed for long-term maintainability.

**Implementation:**
- Clean code practices
- Comprehensive documentation
- Automated testing
- Code review processes

**Benefits:**
- Reduced technical debt
- Faster onboarding
- Easier debugging
- Sustainable development

### 6. Performance

**Principle:** The system is optimized for performance at every layer.

**Implementation:**
- Efficient database queries
- Caching strategies
- Code splitting and lazy loading
- Image optimization

**Benefits:**
- Better user experience
- Lower infrastructure costs
- Higher throughput
- Competitive advantage

### 7. Flexibility

**Principle:** The architecture can adapt to changing business requirements.

**Implementation:**
- Schemaless database design
- Plugin architecture
- Configuration-driven features
- Extensible security model

**Benefits:**
- Faster feature delivery
- Business agility
- Future-proofing
- Competitive responsiveness

---

## Technology Stack

### Frontend Stack

**Framework:**
- **Next.js 16.2.5** - React framework with App Router
- **React 19.2.6** - UI library
- **TypeScript 5** - Type-safe JavaScript

**UI Components:**
- **Tailwind CSS** - Utility-first CSS framework
- **Radix UI** - Unstyled, accessible component primitives
- **shadcn/ui** - Pre-built components built on Radix UI
- **Lucide React** - Icon library

**State Management:**
- **React Context API** - Global state management
- **React Hooks** - Local state management
- **Zustand** (future) - Enhanced state management

**Forms:**
- **React Hook Form** - Form management
- **Zod** - Schema validation

**Data Fetching:**
- **Firebase SDK** - Direct Firestore integration
- **React Query** (future) - Enhanced data fetching

**Utilities:**
- **date-fns** - Date manipulation
- **clsx** - Conditional class names
- **tailwind-merge** - Tailwind class merging

### Backend Stack

**Serverless Functions:**
- **Firebase Functions (Gen 2)** - Serverless compute
- **Node.js 18+** - Runtime environment

**Database:**
- **Firebase Firestore** - NoSQL document database
- **Firebase Storage** - File storage
- **Firebase Authentication** - User authentication

**AI/ML:**
- **Google Genkit** - AI framework for Firebase

### Development Tools

**Package Manager:**
- **npm** or **yarn** - Dependency management

**Code Quality:**
- **ESLint** - Linting
- **Prettier** - Code formatting
- **TypeScript** - Type checking

**Testing:**
- **Jest** - Unit testing
- **React Testing Library** - Component testing
- **Playwright** - E2E testing

**CI/CD:**
- **GitHub Actions** (future) - CI/CD pipeline

### Infrastructure

**Hosting:**
- **Firebase Hosting** - Static site hosting
- **Vercel** (alternative) - Next.js optimized hosting

**Monitoring:**
- **Firebase Crashlytics** - Crash reporting
- **Firebase Performance Monitoring** - Performance tracking
- **Firebase Analytics** - User analytics

**Cost Management:**
- **Firebase Budget Alerts** - Cost monitoring
- **Firestore Usage Metrics** - Database usage tracking

---

## ER Diagrams and Firestore Hierarchy

### High-Level Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        USERS                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  id (PK)                                                 │  │
│  │  name, email, phone, avatar                              │  │
│  │  role (employee|manager|admin|agent)                     │  │
│  │  jobTitle, baseSalary                                    │  │
│  │  workStartTime, workEndTime                              │  │
│  │  lateGraceMinutes, monthlyLeaveCap                       │  │
│  │  dailyBreakCapMinutes                                    │  │
│  │  createdAt, updatedAt, createdBy, updatedBy               │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   ATTENDANCE     │  │     LEAVES       │  │    BOOKINGS      │
│  ┌────────────┐  │  │  ┌────────────┐  │  │  ┌────────────┐  │
│  │userId (FK) │  │  │  │userId (FK) │  │  │  │createdBy   │  │
│  │date        │  │  │  │startDate   │  │  │  │clientId    │──┼──┐
│  │punchIn     │  │  │  │endDate     │  │  │  │bookingType │  │  │
│  │punchOut    │  │  │  │type        │  │  │  │status      │  │  │
│  │status      │  │  │  │status      │  │  │  │total       │  │  │
│  │breaks[]    │  │  │  │days        │  │  │  │payments[]  │  │  │
│  └────────────┘  │  │  └────────────┘  │  │  └────────────┘  │  │
└──────────────────┘  └──────────────────┘  └──────────────────┘  │
                                                                  │
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTS                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  id (PK)                                                 │  │
│  │  name, email, phone, avatar                              │  │
│  │  organizationId (FK)                                      │  │
│  │  status (active|inactive|lead|prospect)                   │  │
│  │  assignedEmployees[] (FK to users)                        │──┼──┐
│  │  visaStatus, visaHistory[]                                │  │  │
│  │  preferredTravelDates{}, tripDestinations[]               │  │  │
│  │  budget, services[], additionalServices[]                 │  │  │
│  │  createdAt, updatedAt, createdBy, updatedBy               │  │  │
│  └──────────────────────────────────────────────────────────┘  │  │
└─────────────────────────────────────────────────────────────────┘  │
                              │                                      │
              ┌───────────────┼───────────────┐                    │
              │               │               │                    │
              ▼               ▼               ▼                    │
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│   BOOKINGS       │  │  CUSTOMER_LOGS   │  │   FOLLOW_UPS     │  │
│  ┌────────────┐  │  │  ┌────────────┐  │  │  ┌────────────┐  │
│  │clientId    │──┼──┼──│clientId    │──┼──┼──│clientId    │──┼──┘
│  │clientName  │  │  │  │activity    │  │  │  │date        │  │
│  │bookingType │  │  │  │userId      │  │  │  │notes       │  │
│  │status      │  │  │  └────────────┘  │  │  │done        │  │
│  │total       │  │  └──────────────────┘  │  │priority    │  │
│  │payments[]  │  │                       │  └────────────┘  │
│  └────────────┘  │                       └──────────────────┘
└──────────────────┘
              │
              ▼
┌──────────────────┐
│    INVOICES      │
│  ┌────────────┐  │
│  │bookingId   │──┘
│  │clientName  │
│  │amount      │
│  │dueDate     │
│  │status      │
│  └────────────┘
└──────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        ORGANIZATIONS                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  id (PK)                                                 │  │
│  │  name, type (corporate)                                   │  │
│  │  contactPerson, email, phone                              │  │
│  │  gstNumber, billingAddress                                │  │
│  │  notes                                                   │  │
│  │  createdAt, createdBy                                    │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        LEADS                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  id (PK)                                                 │  │
│  │  name, email, phone, avatar                              │  │
│  │  status (new|contacted|proposal|won|lost)                │  │
│  │  convertedToClientId (FK to clients)                     │  │
│  │  source, destination, message                            │  │
│  │  preferredTravelDates{}, budget, pax                      │  │
│  │  createdAt, updatedAt, createdBy, updatedBy               │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        HOLIDAYS                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  id (PK)                                                 │  │
│  │  date, name                                              │  │
│  │  createdAt, createdBy                                    │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Firestore Collection Hierarchy

```
firestore/
├── users/                          # User profiles
│   ├── {userId}
│   │   ├── profile data
│   │   └── settings
│
├── clients/                        # Customer profiles
│   ├── {clientId}
│   │   ├── profile data
│   │   ├── visa history
│   │   └── itineraries/            # Subcollection
│   │       └── {itineraryId}
│
├── bookings/                       # Booking records
│   ├── {bookingId}
│   │   ├── booking details
│   │   ├── payments[]
│   │   ├── documents[]
│   │   └── timeline[]
│
├── invoices/                       # Invoice records
│   ├── {invoiceId}
│   │   └── invoice details
│
├── leads/                          # Lead records
│   ├── {leadId}
│   │   └── lead details
│
├── organizations/                  # Corporate accounts
│   ├── {organizationId}
│   │   └── organization details
│
├── customer_logs/                  # Activity logs
│   ├── {logId}
│   │   └── log details
│
├── follow_ups/                     # Follow-up tasks
│   ├── {followUpId}
│   │   └── task details
│
├── attendance/                     # Attendance records
│   ├── {attendanceId}              # Format: {userId}_{YYYY-MM-DD}
│   │   ├── attendance data
│   │   └── breaks[]
│
├── leaves/                         # Leave requests
│   ├── {leaveId}
│   │   └── leave details
│
├── holidays/                       # Company holidays
│   ├── {holidayId}
│   │   └── holiday details
│
├── process_tracking/               # Process tracking
│   ├── {trackingId}
│   │   └── tracking data
│
├── customer_statuses/              # Status definitions (read-only)
│   ├── {statusId}
│   │   └── status definition
│
├── roles/                          # Role definitions (read-only)
│   ├── {roleId}
│   │   └── role definition
│
├── audit_logs/                     # Security audit logs
│   ├── {auditLogId}
│   │   └── audit details
│
├── error_logs/                     # Application error logs
│   ├── {errorLogId}
│   │   └── error details
│
└── login_attempts/                 # Login attempt tracking
    └── {email}                     # Document ID is email
        └── attempt data
```

### Collection Relationships Summary

**Primary Relationships:**

1. **Users → Attendance (One-to-Many)**
   - User can have multiple attendance records
   - Relationship: `attendance.userId → users.id`

2. **Users → Leaves (One-to-Many)**
   - User can have multiple leave requests
   - Relationship: `leaves.userId → users.id`

3. **Users → Bookings (One-to-Many)**
   - User creates multiple bookings
   - Relationship: `bookings.createdBy → users.id`

4. **Clients → Bookings (One-to-Many)**
   - Client can have multiple bookings
   - Relationship: `bookings.clientId → clients.id`

5. **Clients → Customer Logs (One-to-Many)**
   - Client can have multiple activity logs
   - Relationship: `customer_logs.clientId → clients.id`

6. **Clients → Follow Ups (One-to-Many)**
   - Client can have multiple follow-ups
   - Relationship: `follow_ups.clientId → clients.id`

7. **Organizations → Clients (One-to-Many)**
   - Organization can have multiple clients
   - Relationship: `clients.organizationId → organizations.id`

8. **Bookings → Invoices (One-to-Many)**
   - Booking can have multiple invoices
   - Relationship: `invoices.bookingId → bookings.id`

9. **Leads → Clients (One-to-One, Optional)**
   - Lead can be converted to a client
   - Relationship: `leads.convertedToClientId → clients.id`

**Many-to-Many Relationships:**

10. **Clients ↔ Users (Many-to-Many)**
    - Client can be assigned to multiple employees
    - Employee can be assigned to multiple clients
    - Implementation: `clients.assignedEmployees[]` (array of user IDs)

11. **Bookings ↔ Payments (Many-to-Many)**
    - Booking can have multiple payments
    - Payment belongs to one booking
    - Implementation: `bookings.payments[]` (embedded array)

---

## Collection Relationships

### Detailed Relationship Mapping

#### 1. User-Centric Relationships

**User as Creator:**
```
User (1) ──creates──> (N) Bookings
User (1) ──creates──> (N) Clients
User (1) ──creates──> (N) Leads
User (1) ──creates──> (N) Customer Logs
User (1) ──creates──> (N) Follow Ups
User (1) ──creates──> (N) Invoices
User (1) ──creates──> (N) Holidays
User (1) ──creates──> (N) Organizations
```

**User as Subject:**
```
User (1) ──has──> (N) Attendance Records
User (1) ──has──> (N) Leave Requests
User (1) ──is──> (N) Assigned Clients
User (1) ──performs──> (N) Customer Log Activities
```

**User as Approver:**
```
User (1) ──approves──> (N) Leave Requests
```

#### 2. Client-Centric Relationships

**Client as Subject:**
```
Client (1) ──has──> (N) Bookings
Client (1) ──has──> (N) Customer Logs
Client (1) ──has──> (N) Follow Ups
Client (1) ──has──> (N) Invoices
Client (1) ──has──> (N) Itineraries (subcollection)
```

**Client as Assigned:**
```
Client (M) ──assigned to──> (N) Users
```

**Client as Converted:**
```
Lead (1) ──converts to──> (1) Client
```

#### 3. Booking-Centric Relationships

**Booking as Subject:**
```
Booking (1) ──has──> (N) Invoices
Booking (1) ──has──> (N) Payments (embedded)
Booking (1) ──has──> (N) Documents (embedded)
Booking (1) ──has──> (N) Timeline Events (embedded)
```

**Booking as Related:**
```
Booking (N) ──belongs to──> (1) Client
Booking (N) ──created by──> (1) User
```

#### 4. Organization-Centric Relationships

**Organization as Parent:**
```
Organization (1) ──has──> (N) Clients
```

### Relationship Cardinality Matrix

| From Collection | To Collection | Relationship | Cardinality | Implementation |
|-----------------|---------------|--------------|-------------|----------------|
| users | attendance | has | 1:N | attendance.userId |
| users | leaves | has | 1:N | leaves.userId |
| users | bookings | creates | 1:N | bookings.createdBy |
| users | clients | creates | 1:N | clients.createdBy |
| users | leads | creates | 1:N | leads.createdBy |
| users | customer_logs | creates | 1:N | customer_logs.createdBy |
| users | follow_ups | creates | 1:N | follow_ups.createdBy |
| users | invoices | creates | 1:N | invoices.createdBy |
| users | holidays | creates | 1:N | holidays.createdBy |
| users | organizations | creates | 1:N | organizations.createdBy |
| users | leaves | approves | 1:N | leaves.approvedBy |
| users | clients | assigned to | M:N | clients.assignedEmployees[] |
| clients | bookings | has | 1:N | bookings.clientId |
| clients | customer_logs | has | 1:N | customer_logs.clientId |
| clients | follow_ups | has | 1:N | follow_ups.clientId |
| clients | organizations | belongs to | N:1 | clients.organizationId |
| clients | itineraries | has | 1:N | subcollection |
| leads | clients | converts to | 1:1 | leads.convertedToClientId |
| bookings | invoices | has | 1:N | invoices.bookingId |
| bookings | payments | has | 1:N | bookings.payments[] |
| bookings | documents | has | 1:N | bookings.documents[] |
| bookings | timeline | has | 1:N | bookings.timeline[] |

### Data Consistency Rules

**Referential Integrity:**
1. When a user is deleted, their attendance and leave records should be archived
2. When a client is deleted, related bookings should be archived
3. When a booking is deleted, related invoices should be archived
4. Lead conversion should create a client and update lead status

**Cascade Operations:**
1. **Soft Delete:** Mark documents as archived instead of hard delete
2. **Archive Exemption:** Certain documents can be marked as exempt from archival
3. **Timestamp Tracking:** All operations should track who made changes and when

**Denormalization Strategy:**
1. **Client Name:** Denormalized in bookings, invoices, customer_logs, follow_ups
2. **User Name:** Denormalized in attendance, leaves, customer_logs
3. **Booking ID:** Referenced in invoices
4. **Rationale:** Reduce read operations and improve query performance

---

## Domain-Driven Design (DDD)

### Bounded Contexts

The Sky Visa CRM is organized into the following bounded contexts:

#### 1. User Management Context

**Purpose:** Manage user accounts, authentication, and authorization

**Core Entities:**
- User
- Role
- Permission

**Key Operations:**
- User registration
- Authentication
- Role assignment
- Permission management

**Ubiquitous Language:**
- User: Person with system access
- Role: Set of permissions (employee, manager, admin, agent)
- Authentication: Process of verifying identity
- Authorization: Process of granting access

**Domain Events:**
- UserCreated
- UserUpdated
- UserDeleted
- RoleChanged
- PermissionGranted
- PermissionRevoked

#### 2. Customer Management Context

**Purpose:** Manage customer lifecycle from lead to loyal customer

**Core Entities:**
- Lead
- Customer (Client)
- Organization
- CustomerLog
- FollowUp

**Key Operations:**
- Lead creation
- Lead conversion
- Customer profile management
- Activity logging
- Follow-up scheduling

**Ubiquitous Language:**
- Lead: Potential customer
- Customer: Active client
- Conversion: Process of turning lead into customer
- Activity: Interaction with customer
- Follow-up: Scheduled contact with customer

**Domain Events:**
- LeadCreated
- LeadConverted
- CustomerCreated
- CustomerUpdated
- ActivityLogged
- FollowUpScheduled
- FollowUpCompleted

#### 3. Booking Management Context

**Purpose:** Manage travel bookings across all service types

**Core Entities:**
- Booking
- FlightBooking (extends Booking)
- HotelBooking (extends Booking)
- VisaBooking (extends Booking)
- Payment
- Document

**Key Operations:**
- Booking creation
- Booking modification
- Payment processing
- Document upload
- Status updates

**Ubiquitous Language:**
- Booking: Reservation for travel service
- Sector: Flight segment (for multi-city flights)
- Payment: Financial transaction for booking
- Document: Supporting document for booking
- Status: Current state of booking

**Domain Events:**
- BookingCreated
- BookingUpdated
- BookingConfirmed
- BookingCancelled
- PaymentReceived
- PaymentRefunded
- DocumentUploaded
- StatusChanged

#### 4. Invoice Management Context

**Purpose:** Manage invoicing and billing

**Core Entities:**
- Invoice
- InvoiceItem
- Payment

**Key Operations:**
- Invoice generation
- Invoice delivery
- Payment tracking
- Overdue management

**Ubiquitous Language:**
- Invoice: Bill for services
- Due Date: Payment deadline
- Overdue: Past due date
- Paid: Fully settled
- Partial: Partially paid

**Domain Events:**
- InvoiceGenerated
- InvoiceSent
- PaymentReceived
- InvoiceOverdue
- InvoicePaid

#### 5. HR Management Context

**Purpose:** Manage employee operations and HR processes

**Core Entities:**
- Employee (User)
- Attendance
- Leave
- Holiday
- Break

**Key Operations:**
- Attendance tracking
- Leave request management
- Holiday management
- Work time calculation

**Ubiquitous Language:**
- Attendance: Record of employee presence
- Punch In: Start of work day
- Punch Out: End of work day
- Leave: Requested time off
- Holiday: Company-observed holiday
- Break: Temporary pause in work

**Domain Events:**
- AttendanceRecorded
- LeaveRequested
- LeaveApproved
- LeaveRejected
- PunchIn
- PunchOut
- BreakStarted
- BreakEnded

#### 6. Process Tracking Context

**Purpose:** Track business processes and workflows

**Core Entities:**
- Process
- ProcessStep
- ProcessInstance

**Key Operations:**
- Process definition
- Process execution
- Step completion
- Process monitoring

**Ubiquitous Language:**
- Process: Business workflow
- Step: Individual task in process
- Instance: Execution of a process
- Status: Current state of process

**Domain Events:**
- ProcessStarted
- ProcessCompleted
- StepStarted
- StepCompleted
- ProcessFailed

### Aggregates

#### User Aggregate
```
User (Root)
├── Profile
├── Settings
└── Permissions
```

#### Customer Aggregate
```
Customer (Root)
├── Profile
├── Preferences
├── VisaHistory
├── PreviousTrips
└── AssignedEmployees (reference to User)
```

#### Booking Aggregate
```
Booking (Root)
├── BookingDetails
├── Payments (embedded)
├── Documents (embedded)
└── Timeline (embedded)
```

#### Attendance Aggregate
```
Attendance (Root)
├── AttendanceData
└── Breaks (embedded)
```

### Value Objects

**Date Range:**
```typescript
{
  from: Date;
  to: Date;
}
```

**Money:**
```typescript
{
  amount: number;
  currency: string;
}
```

**Contact Info:**
```typescript
{
  phone: string;
  email: string;
}
```

**Address:**
```typescript
{
  street: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
}
```

### Domain Services

**Booking Calculation Service:**
- Calculate booking totals
- Calculate profit margins
- Calculate payment schedules

**Attendance Calculation Service:**
- Calculate work hours
- Calculate overtime
- Calculate break time
- Calculate attendance status

**Leave Calculation Service:**
- Calculate leave balance
- Calculate leave duration
- Calculate leave overlap

**Follow-up Scheduling Service:**
- Schedule follow-ups
- Calculate due dates
- Send reminders

### Repository Pattern

**User Repository:**
```typescript
interface UserRepository {
  findById(id: string): Promise<User>;
  findByEmail(email: string): Promise<User>;
  save(user: User): Promise<void>;
  delete(id: string): Promise<void>;
  findAll(filters: UserFilters): Promise<User[]>;
}
```

**Customer Repository:**
```typescript
interface CustomerRepository {
  findById(id: string): Promise<Customer>;
  findByAssignedEmployee(userId: string): Promise<Customer[]>;
  save(customer: Customer): Promise<void>;
  delete(id: string): Promise<void>;
  findAll(filters: CustomerFilters): Promise<Customer[]>;
}
```

**Booking Repository:**
```typescript
interface BookingRepository {
  findById(id: string): Promise<Booking>;
  findByClient(clientId: string): Promise<Booking[]>;
  findByCreator(userId: string): Promise<Booking[]>;
  save(booking: Booking): Promise<void>;
  delete(id: string): Promise<void>;
  findAll(filters: BookingFilters): Promise<Booking[]>;
}
```

---

## Module-by-Module Database Schemas

### Module 1: User Management

**Collections:**
- users
- roles (read-only)
- customer_statuses (read-only)

**Schema Details:**

**users Collection:**
```typescript
{
  // Identity
  id: string                          // Primary key
  name: string                        // Full name
  email: string                       // Email (unique)
  phone: string                       // Phone number
  
  // Profile
  avatar: string                      // Profile picture URL
  jobTitle: string                    // Job title
  
  // Role & Permissions
  role: string                        // Role enum: employee|manager|admin|agent
  
  // Employment Details
  baseSalary: number                  // Monthly base salary
  workStartTime: string                // Work start time (HH:MM)
  workEndTime: string                  // Work end time (HH:MM)
  lateGraceMinutes: number             // Grace period for late arrival
  monthlyLeaveCap: number              // Monthly leave allowance
  dailyBreakCapMinutes: number         // Daily break allowance
  
  // Audit
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string
  updatedBy: string
}
```

**Indexes:**
- Single: email (for login)
- Composite: role + createdAt (for user listing)

**Security Rules:**
```javascript
match /users/{userId} {
  allow read: if request.auth != null;
  allow create: if request.auth.uid == userId;
  allow update: if request.auth.uid == userId || 
                   request.auth.token.role == 'admin';
  allow delete: if request.auth.token.role == 'admin';
}
```

### Module 2: Customer Management

**Collections:**
- clients
- leads
- organizations
- customer_logs
- follow_ups

**Schema Details:**

**clients Collection:**
```typescript
{
  // Identity
  id: string                          // Primary key
  name: string                        // Full name
  email: string                       // Email
  phone: string                       // Phone number
  avatar: string                      // Profile picture
  
  // Organization
  organizationId: string              // Reference to organizations
  
  // Status
  status: string                      // active|inactive|lead|prospect
  preferences: string                 // Customer preferences
  
  // Personal Details
  dateOfBirth: string                 // ISO date
  gender: string                      // male|female|other
  nationality: string                 // Country code
  
  // Travel Preferences
  preferredDestination: string
  travelPurpose: string
  preferredTravelDates: {
    from: string                      // ISO date
    to: string                        // ISO date
  }
  tripDestinations: [{
    destination: string
    from: string                      // ISO date
    to: string                        // ISO date
  }]
  budget: number
  hotelPreference: string
  
  // Services
  services: string[]                  // flight|hotel|visa|transfers|activity|localTours
  additionalServices: string[]        // travelInsurance|airportPickup|localTours
  
  // Assignment
  assignedEmployees: string[]         // Array of user IDs
  
  // Visa Information
  visaStatus: string                  // toStart|inProcess|applied|approved|rejected|completed|travelling
  visaHistory: [{
    country: string
    status: string                    // approved|rejected
    date: string                      // ISO date
    rejectionReason: string
  }]
  
  // Travel History
  previousTrips: [{
    country: string
    startDate: string                 // ISO date
    endDate: string                   // ISO date
  }]
  
  // Documents
  requiredDocuments: [{
    name: string
    status: string                    // pending|uploaded|verified|received
  }]
  
  // Follow-up
  followUpDate: string                // ISO date
  
  // Companions
  pax: number                        // Number of passengers
  companions: [{
    name: string
    type: string                      // adult|child|infant
  }]
  
  // Audit
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string
  updatedBy: string
}
```

**leads Collection:**
```typescript
{
  // Identity
  id: string                          // Primary key
  name: string                        // Full name
  email: string                       // Email
  phone: string                       // Phone number
  avatar: string                      // Profile picture
  
  // Status
  status: string                      // new|contacted|proposal|won|lost
  source: string                      // Lead source
  
  // Travel Details
  nationality: string
  preferredDestination: string
  travelPurpose: string
  preferredTravelDates: {
    from: string
    to: string
  }
  budget: number
  pax: number
  notes: string
  
  // Conversion
  convertedToClientId: string         // Reference to clients
  convertedAt: Timestamp
  
  // Website Lead Fields
  destination: string
  message: string
  rawPayload: object
  localRef: {
    collection: string
    id: string
  }
  sourceWebsite: string
  phoneDigits: string
  phoneSuffix10: string
  
  // Audit
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string
  updatedBy: string
}
```

**organizations Collection:**
```typescript
{
  // Identity
  id: string                          // Primary key
  name: string                        // Organization name
  type: string                        // corporate
  
  // Contact
  contactPerson: string
  email: string
  phone: string
  
  // Business
  gstNumber: string
  billingAddress: string
  notes: string
  
  // Audit
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string
  updatedBy: string
}
```

**customer_logs Collection:**
```typescript
{
  // Identity
  id: string                          // Primary key
  clientId: string                    // Reference to clients
  clientName: string                  // Denormalized
  userName: string                    // Denormalized
  activity: string                    // Activity description
  userId: string                      // Reference to users
  
  // Audit
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string
  updatedBy: string
}
```

**follow_ups Collection:**
```typescript
{
  // Identity
  id: string                          // Primary key
  clientId: string                    // Reference to clients
  clientName: string                  // Denormalized
  clientEmail: string                 // Denormalized
  clientPhone: string                 // Denormalized
  date: string                        // ISO date
  notes: string | null
  done: boolean
  priority: string                    // low|medium|high
  
  // Audit
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string
  updatedBy: string
}
```

**Indexes:**
- clients: assignedEmployees (array-contains) + status + createdAt
- clients: createdBy + createdAt
- leads: status + createdAt
- leads: source + createdAt
- customer_logs: clientId + createdAt
- customer_logs: userId + createdAt
- follow_ups: clientId + date
- follow_ups: done + date

### Module 3: Booking Management

**Collections:**
- bookings
- invoices

**Schema Details:**

**bookings Collection:**
```typescript
{
  // Identity
  id: string                          // Primary key
  clientId: string                    // Reference to clients
  clientName: string                  // Denormalized
  bookingType: string                 // flight|hotel|car|activity|visa|other
  destination: string
  
  // Flight-specific
  isOneWay: boolean
  hasLayover: boolean
  layoverAirport: string
  isMultiCity: boolean
  sectors: [{
    origin: string
    destination: string
    departure: string                 // ISO datetime
    cabinClass: string
    flightNumber: string
    airportCode: string
  }]
  
  // Visa-specific
  visaApplicants: [{
    name: string
    passportNumber: string
    validFrom: string                 // ISO date
    validUntil: string                // ISO date
  }]
  
  // Hotel-specific
  hotelGuests: [{
    name: string
  }]
  
  // Booking Details
  bookingPortal: string
  startDate: string                   // ISO date
  endDate: string                     // ISO date
  status: string                      // draft|pending|hold|confirmed|cancelled
  progress: number                    // 0-100
  
  // Financials
  total: number
  amountPaid: number
  balanceAmount: number
  paymentStatus: string               // unpaid|partial|paid|refunded
  payments: [{
    id: string
    amount: number
    date: string                      // ISO date
    mode: string                      // cash|card|upi|bank|cheque|other
    reference: string
    note: string
    createdAt: Timestamp
    createdBy: string
    createdByName: string
  }]
  
  // Supplier
  supplierName: string
  supplierCost: number
  supplierReference: string
  profit: number                      // total - supplierCost
  
  // Generic Data
  bookingDetails: object              // Flexible schema
  
  // Documents
  documents: [{
    name: string
    url: string
    uploadedAt: Timestamp
  }]
  
  remarks: string
  
  // Archival
  archived: boolean
  archivedAt: Timestamp
  archiveExempt: boolean
  
  // Timeline
  timeline: [{
    action: string
    userId: string
    userName: string
    createdAt: Timestamp
  }]
  
  // Audit
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string
  updatedBy: string
}
```

**invoices Collection:**
```typescript
{
  // Identity
  id: string                          // Primary key
  bookingId: string                   // Reference to bookings
  clientName: string                  // Denormalized
  amount: number
  dueDate: string                     // ISO date
  status: string                      // paid|unpaid|overdue
  
  // Audit
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string
  updatedBy: string
}
```

**Indexes:**
- bookings: clientId + status + startDate
- bookings: createdBy + createdAt
- bookings: status + startDate
- invoices: bookingId
- invoices: status + dueDate

### Module 4: HR Management

**Collections:**
- attendance
- leaves
- holidays

**Schema Details:**

**attendance Collection:**
```typescript
{
  // Identity
  id: string                          // Format: {userId}_{YYYY-MM-DD}
  userId: string                      // Reference to users
  userName: string                    // Denormalized
  date: string                        // Format: YYYY-MM-DD
  
  // Punch Data
  punchIn: Timestamp
  punchOut: Timestamp
  workStartTime: string               // HH:MM
  workEndTime: string                 // HH:MM
  lateGraceMinutes: number
  punchInLate: boolean
  punchOutEarly: boolean
  autoLoggedOut: boolean
  
  // Calculated
  workMinutes: number
  status: string                      // present|late|half-day|absent|leave|holiday|upcoming
  notes: string
  
  // Break Tracking
  breaks: [{
    id: string                        // UUID
    start: Timestamp
    end: Timestamp
    source: string                    // manual|screen-lock|personal
    durationMinutes: number
  }]
  breakMinutes: number
  activeMinutes: number
  lastActiveAt: Timestamp
  
  // Audit
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

**leaves Collection:**
```typescript
{
  // Identity
  id: string                          // Primary key
  userId: string                      // Reference to users
  userName: string                    // Denormalized
  type: string                        // casual|sick|earned|lop
  startDate: string                   // ISO date
  endDate: string                     // ISO date
  days: number
  reason: string
  status: string                      // pending|approved|rejected
  
  // Approval
  approvedBy: string
  approvedAt: Timestamp
  rejectedBy: string
  rejectedAt: Timestamp
  rejectionReason: string
  
  // Audit
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

**holidays Collection:**
```typescript
{
  // Identity
  id: string                          // Primary key
  date: string                        // Format: YYYY-MM-DD
  name: string
  
  // Audit
  createdAt: Timestamp
  createdBy: string
}
```

**Indexes:**
- attendance: userId + date
- leaves: userId + startDate
- leaves: status + createdAt
- holidays: date

### Module 5: System & Audit

**Collections:**
- process_tracking
- audit_logs
- error_logs
- login_attempts

**Schema Details:**

**process_tracking Collection:**
```typescript
{
  // Identity
  id: string                          // Primary key
  // Flexible schema based on process type
  
  // Audit
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

**audit_logs Collection:**
```typescript
{
  // Identity
  id: string                          // Primary key
  action: string                      // Action performed
  userId: string                      // Reference to users
  userEmail: string
  userName: string
  resourceType: string
  resourceId: string
  changes: object
  ipAddress: string
  userAgent: string
  success: boolean
  errorMessage: string
  timestamp: Timestamp
}
```

**error_logs Collection:**
```typescript
{
  // Identity
  id: string                          // Primary key
  message: string
  code: string
  stack: string
  userId: string
  route: string
  userAgent: string
  details: object
  timestamp: Timestamp
  resolved: boolean
}
```

**login_attempts Collection:**
```typescript
{
  // Identity
  id: string                          // Email address (document ID)
  count: number
  lastAttempt: Timestamp
  lockedUntil: Timestamp
}
```

**Indexes:**
- audit_logs: userId + timestamp
- audit_logs: action + timestamp
- audit_logs: resourceType + resourceId + timestamp
- error_logs: resolved + timestamp
- error_logs: code + timestamp

---

## Security Rules Architecture

### Security Principles

1. **Least Privilege:** Users only have access to data they need
2. **Defense in Depth:** Multiple layers of security
3. **Audit Trail:** All access is logged
4. **Data Isolation:** Tenant data is isolated (future multi-tenant)
5. **Role-Based:** Access based on user roles

### Security Rules Structure

```
firestore.rules
├── match /databases/{database}/documents
│   ├── match /users/{userId}
│   ├── match /clients/{clientId}
│   ├── match /bookings/{bookingId}
│   ├── match /invoices/{invoiceId}
│   ├── match /leads/{leadId}
│   ├── match /organizations/{organizationId}
│   ├── match /customer_logs/{logId}
│   ├── match /follow_ups/{followUpId}
│   ├── match /attendance/{attendanceId}
│   ├── match /leaves/{leaveId}
│   ├── match /holidays/{holidayId}
│   ├── match /process_tracking/{trackingId}
│   ├── match /customer_statuses/{statusId}
│   ├── match /roles/{roleId}
│   ├── match /audit_logs/{auditLogId}
│   ├── match /error_logs/{errorLogId}
│   └── match /login_attempts/{email}
```

### Collection-Specific Security Rules

#### Users Collection

```javascript
match /users/{userId} {
  // Read: All signed-in users can read user profiles
  allow read: if request.auth != null;
  
  // Create: Users can create their own account
  allow create: if request.auth.uid == userId;
  
  // Update: Users can update their own profile
  // Admins can update any user
  allow update: if request.auth.uid == userId || 
                   request.auth.token.role == 'admin';
  
  // Delete: Only admins can delete users
  allow delete: if request.auth.token.role == 'admin';
  
  // Validation
  allow write: if request.resource.data.size() < 10000; // Max 10KB
}
```

#### Clients Collection

```javascript
match /clients/{clientId} {
  // Helper function to check if user is assigned to client
  function isAssignedUser() {
    return request.auth.uid in resource.data.assignedEmployees;
  }
  
  // Helper function to check if user created the client
  function isCreator() {
    return request.auth.uid == resource.data.createdBy;
  }
  
  // Helper function to check if user is admin or manager
  function isAdminOrManager() {
    return request.auth.token.role in ['admin', 'manager'];
  }
  
  // Read: Assigned users, creator, or admin/manager
  allow read: if isAssignedUser() || 
               isCreator() || 
               isAdminOrManager();
  
  // Create: Any signed-in user or public form (with validation)
  allow create: if request.auth != null || 
                  request.resource.data.source == 'public';
  
  // Update: Assigned users, creator, or admin/manager
  allow update: if isAssignedUser() || 
                isCreator() || 
                isAdminOrManager();
  
  // Delete: Only admin or manager
  allow delete: if isAdminOrManager();
}
```

#### Bookings Collection

```javascript
match /bookings/{bookingId} {
  // Helper function to check if user created the booking
  function isCreator() {
    return request.auth.uid == resource.data.createdBy;
  }
  
  // Helper function to check if user is assigned to client
  function isAssignedToClient() {
    return request.auth.uid in get(/databases/$(database)/documents/clients/$(resource.data.clientId)).data.assignedEmployees;
  }
  
  // Helper function to check if user is admin or manager
  function isAdminOrManager() {
    return request.auth.token.role in ['admin', 'manager'];
  }
  
  // Read: Creator, assigned to client, or admin/manager
  allow read: if isCreator() || 
               isAssignedToClient() || 
               isAdminOrManager();
  
  // Create: Any signed-in user
  allow create: if request.auth != null;
  
  // Update: Creator, assigned to client, or admin/manager
  allow update: if isCreator() || 
                isAssignedToClient() || 
                isAdminOrManager();
  
  // Delete: Only admin or manager
  allow delete: if isAdminOrManager();
}
```

#### Attendance Collection

```javascript
match /attendance/{attendanceId} {
  // Extract userId from attendanceId format: {userId}_{YYYY-MM-DD}
  function getUserIdFromId() {
    return attendanceId.split('_')[0];
  }
  
  // Helper function to check if user owns the attendance record
  function isOwner() {
    return request.auth.uid == getUserIdFromId();
  }
  
  // Get: Admin or owner
  allow get: if request.auth.token.role == 'admin' || 
              isOwner();
  
  // List: Admin or owner (filtered by userId)
  allow list: if request.auth.token.role == 'admin' ||
                request.query.limit <= 50;
  
  // Create: Admin or owner (deterministic ID)
  allow create: if request.auth.token.role == 'admin' ||
                   request.auth.uid == getUserIdFromId();
  
  // Update: Admin or owner (punchIn and date are locked)
  allow update: if request.auth.token.role == 'admin' ||
                (isOwner() && 
                 request.resource.data.punchIn == resource.data.punchIn &&
                 request.resource.data.date == resource.data.date);
  
  // Delete: Only admin
  allow delete: if request.auth.token.role == 'admin';
}
```

#### Leaves Collection

```javascript
match /leaves/{leaveId} {
  // Helper function to check if user owns the leave request
  function isOwner() {
    return request.auth.uid == resource.data.userId;
  }
  
  // Helper function to check if user is admin
  function isAdmin() {
    return request.auth.token.role == 'admin';
  }
  
  // Read: All signed-in users
  allow read: if request.auth != null;
  
  // Create: Users can create their own leave (pending status)
  allow create: if isOwner() && 
                  request.resource.data.status == 'pending';
  
  // Update: 
  // - Users can update their own pending leaves (cannot flip status)
  // - Admins can update any leave
  allow update: if isAdmin() ||
                (isOwner() && 
                 resource.data.status == 'pending' &&
                 request.resource.data.status == 'pending');
  
  // Delete: Admin or owner (pending status only)
  allow delete: if isAdmin() ||
                (isOwner() && resource.data.status == 'pending');
}
```

#### Audit Logs Collection

```javascript
match /audit_logs/{auditLogId} {
  // Read: Only admins
  allow read: if request.auth.token.role == 'admin';
  
  // Write: Only system (via backend functions)
  // No client-side writes allowed
  allow write: if false;
}
```

#### Error Logs Collection

```javascript
match /error_logs/{errorLogId} {
  // Read: Only admins
  allow read: if request.auth.token.role == 'admin';
  
  // Write: Only system (via error handler)
  // No client-side writes allowed
  allow write: if false;
}
```

### Security Functions

```javascript
// Helper functions for security rules

functions {
  // Check if user has specific role
  function hasRole(role) {
    return request.auth.token.role == role;
  }
  
  // Check if user has any of the specified roles
  function hasAnyRole(roles) {
    return request.auth.token.role in roles;
  }
  
  // Check if user is admin
  function isAdmin() {
    return hasRole('admin');
  }
  
  // Check if user is manager or admin
  function isManagerOrAdmin() {
    return hasAnyRole(['manager', 'admin']);
  }
  
  // Check if user is authenticated
  function isAuthenticated() {
    return request.auth != null;
  }
  
  // Validate email format
  function isValidEmail(email) {
    return email.matches('^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$');
  }
  
  // Validate phone format (E.164)
  function isValidPhone(phone) {
    return phone.matches('^\\+[1-9]\\d{1,14}$');
  }
  
  // Validate date format (ISO)
  function isValidDate(date) {
    return date.matches('^\\d{4}-\\d{2}-\\d{2}$');
  }
  
  // Validate time format (HH:MM)
  function isValidTime(time) {
    return time.matches('^([01]\\d|2[0-3]):([0-5]\\d)$');
  }
}
```

### Data Validation Rules

```javascript
// Validation rules for common fields

match /{document=**} {
  // Validate document size
  allow write: if request.resource.data.size() < 1000000; // Max 1MB
  
  // Validate timestamp fields
  allow write: if request.resource.data.createdAt is timestamp &&
                request.resource.data.updatedAt is timestamp;
  
  // Validate audit fields
  allow write: if request.resource.data.createdBy is string &&
                request.resource.data.updatedBy is string;
}
```

### Security Best Practices

1. **Use Functions:** Reusable functions for common checks
2. **Validate Input:** Validate all incoming data
3. **Limit Results:** Use query limits to prevent data exfiltration
4. **Audit Everything:** Log all security-relevant events
5. **Principle of Least Privilege:** Grant minimum necessary access
6. **Regular Reviews:** Review and update security rules regularly
7. **Testing:** Test security rules thoroughly before deployment

---

## Index Strategy and Optimization

### Indexing Principles

1. **Query-Driven:** Create indexes based on actual query patterns
2. **Composite Indexes:** Use composite indexes for multi-field queries
3. **Array-Contains:** Special handling for array-contains queries
4. **Ordering:** Include sort fields in composite indexes
5. **Cost Awareness:** Each index adds storage and write cost

### Required Indexes

#### Clients Collection

**Index 1: Assigned Employees + Status + CreatedAt**
```json
{
  "collectionGroup": "clients",
  "queryScope": "COLLECTION",
  "fields": [
    {
      "fieldPath": "assignedEmployees",
      "arrayConfig": "CONTAINS"
    },
    {
      "fieldPath": "status",
      "order": "ASCENDING"
    },
    {
      "fieldPath": "createdAt",
      "order": "DESCENDING"
    }
  ]
}
```
**Purpose:** Query clients assigned to a user, filtered by status, sorted by creation date

**Index 2: CreatedBy + CreatedAt**
```json
{
  "collectionGroup": "clients",
  "queryScope": "COLLECTION",
  "fields": [
    {
      "fieldPath": "createdBy",
      "order": "ASCENDING"
    },
    {
      "fieldPath": "createdAt",
      "order": "DESCENDING"
    }
  ]
}
```
**Purpose:** Query clients created by a user, sorted by creation date

#### Bookings Collection

**Index 1: ClientId + Status + StartDate**
```json
{
  "collectionGroup": "bookings",
  "queryScope": "COLLECTION",
  "fields": [
    {
      "fieldPath": "clientId",
      "order": "ASCENDING"
    },
    {
      "fieldPath": "status",
      "order": "ASCENDING"
    },
    {
      "fieldPath": "startDate",
      "order": "DESCENDING"
    }
  ]
}
```
**Purpose:** Query bookings for a client, filtered by status, sorted by start date

**Index 2: CreatedBy + CreatedAt**
```json
{
  "collectionGroup": "bookings",
  "queryScope": "COLLECTION",
  "fields": [
    {
      "fieldPath": "createdBy",
      "order": "ASCENDING"
    },
    {
      "fieldPath": "createdAt",
      "order": "DESCENDING"
    }
  ]
}
```
**Purpose:** Query bookings created by a user, sorted by creation date

**Index 3: Status + StartDate**
```json
{
  "collectionGroup": "bookings",
  "queryScope": "COLLECTION",
  "fields": [
    {
      "fieldPath": "status",
      "order": "ASCENDING"
    },
    {
      "fieldPath": "startDate",
      "order": "DESCENDING"
    }
  ]
}
```
**Purpose:** Query all bookings by status, sorted by start date

#### Invoices Collection

**Index 1: BookingId**
```json
{
  "collectionGroup": "invoices",
  "queryScope": "COLLECTION",
  "fields": [
    {
      "fieldPath": "bookingId",
      "order": "ASCENDING"
    }
  ]
}
```
**Purpose:** Query invoices for a specific booking

**Index 2: Status + DueDate**
```json
{
  "collectionGroup": "invoices",
  "queryScope": "COLLECTION",
  "fields": [
    {
      "fieldPath": "status",
      "order": "ASCENDING"
    },
    {
      "fieldPath": "dueDate",
      "order": "ASCENDING"
    }
  ]
}
```
**Purpose:** Query invoices by status, sorted by due date

#### Follow Ups Collection

**Index 1: ClientId + Date**
```json
{
  "collectionGroup": "follow_ups",
  "queryScope": "COLLECTION",
  "fields": [
    {
      "fieldPath": "clientId",
      "order": "ASCENDING"
    },
    {
      "fieldPath": "date",
      "order": "DESCENDING"
    }
  ]
}
```
**Purpose:** Query follow-ups for a client, sorted by date

**Index 2: Done + Date**
```json
{
  "collectionGroup": "follow_ups",
  "queryScope": "COLLECTION",
  "fields": [
    {
      "fieldPath": "done",
      "order": "ASCENDING"
    },
    {
      "fieldPath": "date",
      "order": "ASCENDING"
    }
  ]
}
```
**Purpose:** Query pending follow-ups, sorted by date

#### Customer Logs Collection

**Index 1: ClientId + CreatedAt**
```json
{
  "collectionGroup": "customer_logs",
  "queryScope": "COLLECTION",
  "fields": [
    {
      "fieldPath": "clientId",
      "order": "ASCENDING"
    },
    {
      "fieldPath": "createdAt",
      "order": "DESCENDING"
    }
  ]
}
```
**Purpose:** Query activity logs for a client, sorted by creation time

**Index 2: UserId + CreatedAt**
```json
{
  "collectionGroup": "customer_logs",
  "queryScope": "COLLECTION",
  "fields": [
    {
      "fieldPath": "userId",
      "order": "ASCENDING"
    },
    {
      "fieldPath": "createdAt",
      "order": "DESCENDING"
    }
  ]
}
```
**Purpose:** Query activity logs by user, sorted by creation time

#### Attendance Collection

**Index 1: UserId + Date**
```json
{
  "collectionGroup": "attendance",
  "queryScope": "COLLECTION",
  "fields": [
    {
      "fieldPath": "userId",
      "order": "ASCENDING"
    },
    {
      "fieldPath": "date",
      "order": "ASCENDING"
    }
  ]
}
```
**Purpose:** Query attendance records for a user, sorted by date

#### Leaves Collection

**Index 1: UserId + StartDate**
```json
{
  "collectionGroup": "leaves",
  "queryScope": "COLLECTION",
  "fields": [
    {
      "fieldPath": "userId",
      "order": "ASCENDING"
    },
    {
      "fieldPath": "startDate",
      "order": "DESCENDING"
    }
  ]
}
```
**Purpose:** Query leave requests for a user, sorted by start date

**Index 2: Status + CreatedAt**
```json
{
  "collectionGroup": "leaves",
  "queryScope": "COLLECTION",
  "fields": [
    {
      "fieldPath": "status",
      "order": "ASCENDING"
    },
    {
      "fieldPath": "createdAt",
      "order": "DESCENDING"
    }
  ]
}
```
**Purpose:** Query leave requests by status, sorted by creation date

#### Holidays Collection

**Index 1: Date**
```json
{
  "collectionGroup": "holidays",
  "queryScope": "COLLECTION",
  "fields": [
    {
      "fieldPath": "date",
      "order": "ASCENDING"
    }
  ]
}
```
**Purpose:** Query holidays sorted by date

#### Audit Logs Collection

**Index 1: UserId + Timestamp**
```json
{
  "collectionGroup": "audit_logs",
  "queryScope": "COLLECTION",
  "fields": [
    {
      "fieldPath": "userId",
      "order": "ASCENDING"
    },
    {
      "fieldPath": "timestamp",
      "order": "DESCENDING"
    }
  ]
}
```
**Purpose:** Query audit logs by user, sorted by timestamp

**Index 2: Action + Timestamp**
```json
{
  "collectionGroup": "audit_logs",
  "queryScope": "COLLECTION",
  "fields": [
    {
      "fieldPath": "action",
      "order": "ASCENDING"
    },
    {
      "fieldPath": "timestamp",
      "order": "DESCENDING"
    }
  ]
}
```
**Purpose:** Query audit logs by action, sorted by timestamp

**Index 3: ResourceType + ResourceId + Timestamp**
```json
{
  "collectionGroup": "audit_logs",
  "queryScope": "COLLECTION",
  "fields": [
    {
      "fieldPath": "resourceType",
      "order": "ASCENDING"
    },
    {
      "fieldPath": "resourceId",
      "order": "ASCENDING"
    },
    {
      "fieldPath": "timestamp",
      "order": "DESCENDING"
    }
  ]
}
```
**Purpose:** Query audit logs for a specific resource, sorted by timestamp

#### Error Logs Collection

**Index 1: Resolved + Timestamp**
```json
{
  "collectionGroup": "error_logs",
  "queryScope": "COLLECTION",
  "fields": [
    {
      "fieldPath": "resolved",
      "order": "ASCENDING"
    },
    {
      "fieldPath": "timestamp",
      "order": "DESCENDING"
    }
  ]
}
```
**Purpose:** Query error logs by resolution status, sorted by timestamp

**Index 2: Code + Timestamp**
```json
{
  "collectionGroup": "error_logs",
  "queryScope": "COLLECTION",
  "fields": [
    {
      "fieldPath": "code",
      "order": "ASCENDING"
    },
    {
      "fieldPath": "timestamp",
      "order": "DESCENDING"
    }
  ]
}
```
**Purpose:** Query error logs by error code, sorted by timestamp

### Index Optimization Strategies

#### 1. Query Analysis

**Monitor Query Performance:**
```typescript
// Use Firestore query performance monitoring
import { getPerformance } from 'firebase/performance';

const perf = getPerformance();
const trace = perf.trace('client_query');
trace.start();

// Execute query
const query = getClientsOptimized(userId);
const snapshot = await getDocs(query);

trace.stop();
```

#### 2. Index Usage Monitoring

**Check Index Usage:**
- Use Firebase Console to monitor index usage
- Remove unused indexes to reduce costs
- Optimize frequently used indexes

#### 3. Query Optimization

**Selective Field Retrieval:**
```typescript
// Bad: Retrieve all fields
const query = query(collection(db, 'clients'), where('assignedEmployees', 'array-contains', userId));

// Good: Retrieve only needed fields
const query = query(
  collection(db, 'clients'),
  where('assignedEmployees', 'array-contains', userId),
  select('name', 'email', 'phone', 'status', 'visaStatus', 'createdAt')
);
```

**Pagination:**
```typescript
// Implement pagination for large result sets
const query = query(
  collection(db, 'clients'),
  where('assignedEmployees', 'array-contains', userId),
  orderBy('createdAt', 'desc'),
  limit(20)
);

// For next page
if (lastDoc) {
  const nextPageQuery = query(query, startAfter(lastDoc));
}
```

#### 4. Array-Contains Optimization

**Limit Array Size:**
```typescript
// Keep assignedEmployees array small
// Maximum recommended: 100 elements
// For larger arrays, consider junction collection
```

**Alternative for Large Arrays:**
```typescript
// Use junction collection for many-to-many relationships
// client_assignments collection
{
  clientId: string
  userId: string
  createdAt: Timestamp
}

// Query: where('userId', '==', userId)
```

### Index Cost Management

**Cost Considerations:**
- Each index adds storage cost
- Each index adds write cost
- Indexes are billed per 1GB storage
- Monitor index size regularly

**Cost Optimization:**
1. Remove unused indexes
2. Use single-field indexes where possible
3. Limit composite index fields
4. Monitor index size in Firebase Console

---

## Cost Optimization Strategies

### Firestore Cost Structure

**Read Operations:**
- Charged per document read
- Real-time listeners charged per read
- Query results count as reads

**Write Operations:**
- Charged per document write
- Array operations count as 1 write
- Transactions count as multiple writes

**Delete Operations:**
- Charged per document delete
- Bulk delete counts as multiple deletes

**Storage:**
- Charged per GB stored
- Includes document data and indexes
- Indexes add to storage cost

### Optimization Strategies

#### 1. Read Optimization

**Selective Field Retrieval:**
```typescript
// Retrieve only needed fields
const query = query(
  collection(db, 'clients'),
  select('name', 'email', 'phone', 'status'),
  where('assignedEmployees', 'array-contains', userId)
);
```

**Pagination:**
```typescript
// Limit results and implement pagination
const query = query(
  collection(db, 'clients'),
  where('assignedEmployees', 'array-contains', userId),
  limit(20)
);
```

**Caching:**
```typescript
// Implement client-side caching
const cache = new Map();

async function getCachedClient(clientId: string) {
  if (cache.has(clientId)) {
    return cache.get(clientId);
  }
  
  const doc = await getDoc(doc(db, 'clients', clientId));
  const client = doc.data();
  cache.set(clientId, client);
  return client;
}
```

**Real-time Listener Optimization:**
```typescript
// Use onSnapshot with options
onSnapshot(
  query(collection(db, 'clients'), limit(10)),
  { includeMetadataChanges: false }, // Don't include metadata
  (snapshot) => {
    // Handle snapshot
  }
);
```

#### 2. Write Optimization

**Batch Writes:**
```typescript
// Use batch writes for multiple operations
const batch = writeBatch(db);

clients.forEach(client => {
  const docRef = doc(db, 'clients', client.id);
  batch.set(docRef, client);
});

await batch.commit();
```

**Conditional Updates:**
```typescript
// Use update with field masks
await updateDoc(doc(db, 'clients', clientId), {
  status: 'active',
  updatedAt: serverTimestamp()
});
```

**Array Operations:**
```typescript
// Use arrayUnion/arrayRemove for single write
await updateDoc(doc(db, 'clients', clientId), {
  assignedEmployees: arrayUnion(userId)
});
```

#### 3. Storage Optimization

**Document Size Reduction:**
```typescript
// Remove unnecessary fields
// Use short field names
// Compress large data
// Use references instead of embedding
```

**Index Optimization:**
```typescript
// Remove unused indexes
// Use single-field indexes where possible
// Limit composite index fields
```

**Data Archival:**
```typescript
// Archive old data to reduce active storage
// Use Cloud Storage for archival
// Implement TTL for temporary data
```

#### 4. Query Optimization

**Efficient Queries:**
```typescript
// Use indexes for queries
// Limit query results
// Use selective field retrieval
// Avoid array-contains with large arrays
```

**Query Batching:**
```typescript
// Batch multiple queries
const queries = [
  getDocs(query(collection(db, 'clients'), limit(10))),
  getDocs(query(collection(db, 'bookings'), limit(10)))
];

const results = await Promise.all(queries);
```

### Cost Monitoring

**Firebase Budget Alerts:**
```typescript
// Set up budget alerts in Firebase Console
// Monitor daily/weekly costs
// Set up cost thresholds
```

**Usage Metrics:**
```typescript
// Monitor Firestore usage
// Track read/write operations
// Monitor storage usage
// Analyze query patterns
```

### Cost Reduction Techniques

#### 1. Data Modeling

**Denormalization:**
```typescript
// Denormalize frequently accessed data
// Reduces read operations
// Increases write operations
// Trade-off based on read/write ratio
```

**Embedded Documents:**
```typescript
// Embed related data in parent document
// Reduces read operations
// Increases document size
// Use for 1:N with <100 items
```

**Reference Documents:**
```typescript
// Use references for large related data
// Reduces document size
// Increases read operations
// Use for 1:N with >100 items
```

#### 2. Caching Strategy

**Application-Level Caching:**
```typescript
// Cache frequently accessed data
// Implement TTL for cache entries
// Invalidate cache on updates
// Use memory cache for hot data
```

**CDN Caching:**
```typescript
// Use CDN for static assets
// Cache API responses
// Implement cache headers
// Use edge caching
```

#### 3. Data Lifecycle Management

**Data Archival:**
```typescript
// Archive old data to reduce costs
// Move to cheaper storage
// Implement retention policies
// Automate archival process
```

**Data Cleanup:**
```typescript
// Clean up old data
// Remove deleted documents
// Clear old logs
// Implement data retention policies
```

### Cost Projection

**Estimated Costs (Single-Tenant):**

**Read Operations:**
- 100 users × 50 reads/day = 5,000 reads/day
- 5,000 × 30 days = 150,000 reads/month
- Cost: $0.06/100,000 reads = $0.09/month

**Write Operations:**
- 100 users × 10 writes/day = 1,000 writes/day
- 1,000 × 30 days = 30,000 writes/month
- Cost: $0.18/100,000 writes = $0.05/month

**Storage:**
- 10,000 documents × 5 KB = 50 MB
- 50 MB × indexes (2x) = 100 MB
- Cost: $0.18/GB/month = $0.02/month

**Total Estimated Cost:** ~$0.16/month (single-tenant)

**Multi-Tenant Projection (10,000 tenants):**
- Scale linearly with tenant count
- Estimated: $1,600/month
- Requires cost optimization at scale

---

## Caching Strategy

### Caching Layers

#### 1. Browser Cache

**HTTP Caching:**
```typescript
// Set cache headers for API responses
headers: {
  'Cache-Control': 'public, max-age=3600', // 1 hour
  'ETag': documentHash
}
```

**Service Worker:**
```typescript
// Implement service worker for offline support
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
```

#### 2. Application Cache

**Memory Cache:**
```typescript
class MemoryCache {
  private cache = new Map<string, CacheEntry>();
  private defaultTTL = 5 * 60 * 1000; // 5 minutes

  set<T>(key: string, value: T, ttl?: number): void {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
}
```

**LocalStorage Cache:**
```typescript
class LocalStorageCache {
  private prefix = 'cache_';

  set<T>(key: string, value: T, ttl?: number): void {
    const entry = {
      value,
      timestamp: Date.now(),
      ttl: ttl || 5 * 60 * 1000
    };
    localStorage.setItem(this.prefix + key, JSON.stringify(entry));
  }

  get<T>(key: string): T | null {
    const item = localStorage.getItem(this.prefix + key);
    if (!item) return null;

    const entry = JSON.parse(item);
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      localStorage.removeItem(this.prefix + key);
      return null;
    }

    return entry.value as T;
  }

  invalidate(key: string): void {
    localStorage.removeItem(this.prefix + key);
  }

  clear(): void {
    Object.keys(localStorage)
      .filter(key => key.startsWith(this.prefix))
      .forEach(key => localStorage.removeItem(key));
  }
}
```

#### 3. Firestore Offline Persistence

**Enable Offline Persistence:**
```typescript
import { enableIndexedDbPersistence } from 'firebase/firestore';
import { db } from '@/firebase';

async function enableOfflinePersistence() {
  try {
    await enableIndexedDbPersistence(db);
    console.log('Offline persistence enabled');
  } catch (err) {
    if (err.code === 'failed-precondition') {
      console.log('Multiple tabs open, persistence can only be enabled in one tab');
    } else if (err.code === 'unimplemented') {
      console.log('Browser does not support offline persistence');
    }
  }
}

enableOfflinePersistence();
```

#### 4. CDN Cache

**Static Asset Caching:**
```typescript
// Use CDN for static assets
// Firebase Hosting automatically caches static files
// Configure cache headers in firebase.json
{
  "hosting": {
    "public": "out",
    "headers": [
      {
        "source": "**/*.@(jpg|jpeg|png|gif|svg|webp)",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "public, max-age=31536000, immutable"
          }
        ]
      }
    ]
  }
}
```

### Cache Invalidation Strategies

#### 1. Time-Based Invalidation

```typescript
// Invalidate cache after TTL
const cache = new MemoryCache();
cache.set('clients', clients, 5 * 60 * 1000); // 5 minutes
```

#### 2. Event-Based Invalidation

```typescript
// Invalidate cache on data updates
async function updateClient(clientId: string, updates: any) {
  await updateDoc(doc(db, 'clients', clientId), updates);
  cache.invalidate(`client_${clientId}`);
  cache.invalidate('clients_list');
}
```

#### 3. Manual Invalidation

```typescript
// Provide manual cache refresh
function refreshCache() {
  cache.clear();
  // Reload data
}
```

### Cache Key Strategy

```typescript
class CacheKeyBuilder {
  static build(prefix: string, params: Record<string, any>): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');
    return `${prefix}?${sortedParams}`;
  }
}

// Usage
const cacheKey = CacheKeyBuilder.build('clients', {
  userId: 'abc123',
  status: 'active',
  limit: 20
});
```

### Cache Performance Monitoring

```typescript
class CacheMonitor {
  private hits = 0;
  private misses = 0;

  recordHit(): void {
    this.hits++;
  }

  recordMiss(): void {
    this.misses++;
  }

  getHitRate(): number {
    const total = this.hits + this.misses;
    return total > 0 ? this.hits / total : 0;
  }

  getStats(): { hits: number; misses: number; hitRate: number } {
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: this.getHitRate()
    };
  }
}
```

---

## Backup and Archival Plan

### Backup Strategy

#### 1. Automated Daily Backups

**Firebase Cloud Function:**
```typescript
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

export const dailyBackup = onSchedule(
  {
    schedule: 'every 24 hours',
    timeZone: 'Asia/Kolkata',
    region: 'us-central1',
  },
  async () => {
    const db = getFirestore();
    const backupDb = getFirestore('backup-project-id');
    
    const collections = [
      'users',
      'clients',
      'bookings',
      'invoices',
      'leads',
      'organizations',
      'customer_logs',
      'follow_ups',
      'attendance',
      'leaves',
      'holidays'
    ];
    
    const backupTimestamp = new Date().toISOString();
    
    for (const collectionName of collections) {
      try {
        logger.info(`Starting backup for collection: ${collectionName}`);
        
        const snapshot = await db.collection(collectionName).get();
        let backedUp = 0;
        let failed = 0;
        
        for (const doc of snapshot.docs) {
          try {
            await backupDb
              .collection(collectionName)
              .doc(`${doc.id}_${backupTimestamp}`)
              .set({
                ...doc.data(),
                _backupTimestamp: backupTimestamp,
                _backupSource: 'production',
                _originalDocId: doc.id
              });
            backedUp++;
          } catch (error) {
            failed++;
            logger.error(`Failed to backup document ${doc.id}:`, error);
          }
        }
        
        logger.info(
          `Backup completed for ${collectionName}: ${backedUp} succeeded, ${failed} failed`
        );
      } catch (error) {
        logger.error(`Failed to backup collection ${collectionName}:`, error);
      }
    }
    
    logger.info('Daily backup completed successfully');
  }
);
```

#### 2. Backup Verification

**Firebase Cloud Function:**
```typescript
export const verifyBackups = onSchedule(
  {
    schedule: 'every monday 00:00:00',
    timeZone: 'Asia/Kolkata',
  },
  async () => {
    const db = getFirestore();
    const backupDb = getFirestore('backup-project-id');
    
    const collections = ['clients', 'bookings', 'invoices'];
    
    for (const collectionName of collections) {
      // Get latest backup
      const latestBackup = await backupDb
        .collection(collectionName)
        .orderBy('_backupTimestamp', 'desc')
        .limit(1)
        .get();
      
      if (latestBackup.empty) {
        logger.error(`No backup found for ${collectionName}`);
        continue;
      }
      
      const backupTimestamp = latestBackup.docs[0].data()._backupTimestamp;
      const backupAge = Date.now() - new Date(backupTimestamp).getTime();
      const maxAge = 48 * 60 * 60 * 1000; // 48 hours
      
      if (backupAge > maxAge) {
        logger.error(`Backup for ${collectionName} is too old: ${backupAge}ms`);
        // Send alert
      }
      
      // Verify document count
      const productionCount = (await db.collection(collectionName).count().get()).data().count;
      const backupCount = (await backupDb
        .collection(collectionName)
        .where('_backupTimestamp', '==', backupTimestamp)
        .count()
        .get()).data().count;
      
      if (Math.abs(productionCount - backupCount) > 10) {
        logger.warn(
          `Document count mismatch for ${collectionName}: ` +
          `production=${productionCount}, backup=${backupCount}`
        );
      }
    }
  }
);
```

#### 3. Manual Backup Trigger

**Firebase Cloud Function:**
```typescript
import { onCall, HttpsError } from 'firebase-functions/v2/https';

export const triggerManualBackup = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  
  // Verify admin role
  const userDoc = await getFirestore()
    .collection('users')
    .doc(request.auth.uid)
    .get();
  
  if (userDoc.data()?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only admins can trigger backups');
  }
  
  // Trigger backup process
  await performBackup();
  
  return { success: true, timestamp: new Date().toISOString() };
});
```

### Archival Strategy

#### 1. Automated Archival

**Archival Criteria:**
- Bookings: 15 days after payment completion
- Follow-ups: 30 days after completion
- Customer logs: 90 days old
- Audit logs: 180 days old

**Firebase Cloud Function:**
```typescript
export const archiveOldData = onSchedule(
  {
    schedule: 'every day 02:00:00',
    timeZone: 'Asia/Kolkata',
  },
  async () => {
    const db = getFirestore();
    const archiveDb = getFirestore('archive-project-id');
    
    // Archive old bookings
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 15);
    
    const oldBookings = await db
      .collection('bookings')
      .where('status', '==', 'confirmed')
      .where('paymentStatus', '==', 'paid')
      .where('updatedAt', '<', cutoffDate.toISOString())
      .where('archived', '==', false)
      .where('archiveExempt', '==', false)
      .limit(100)
      .get();
    
    for (const doc of oldBookings.docs) {
      try {
        // Copy to archive
        await archiveDb
          .collection('bookings')
          .add({
            ...doc.data(),
            _archivedAt: new Date().toISOString(),
            _originalId: doc.id
          });
        
        // Mark as archived
        await updateDoc(doc.ref, {
          archived: true,
          archivedAt: new Date().toISOString()
        });
      } catch (error) {
        logger.error(`Failed to archive booking ${doc.id}:`, error);
      }
    }
    
    logger.info(`Archived ${oldBookings.size} bookings`);
  }
);
```

#### 2. Archive Exemption

**Mark Documents as Archive Exempt:**
```typescript
await updateDoc(doc(db, 'bookings', bookingId), {
  archiveExempt: true
});
```

#### 3. Archive Retrieval

**Restore from Archive:**
```typescript
async function restoreFromArchive(archiveId: string) {
  const archiveDb = getFirestore('archive-project-id');
  const db = getFirestore();
  
  const archiveDoc = await archiveDb.collection('bookings').doc(archiveId).get();
  const archiveData = archiveDoc.data();
  
  // Restore to production
  await db.collection('bookings').add({
    ...archiveData,
    archived: false,
    archivedAt: null,
    archiveExempt: true
  });
  
  // Mark archive as restored
  await archiveDoc.ref.update({
    _restoredAt: new Date().toISOString()
  });
}
```

### Retention Policy

**Data Retention Periods:**
- Active data: Indefinite
- Archived data: 7 years
- Audit logs: 3 years
- Error logs: 1 year
- Backup data: 30 days

**Automated Cleanup:**
```typescript
export const cleanupOldArchives = onSchedule(
  {
    schedule: 'every month 01:00:00',
    timeZone: 'Asia/Kolkata',
  },
  async () => {
    const archiveDb = getFirestore('archive-project-id');
    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - 7);
    
    const oldArchives = await archiveDb
      .collection('bookings')
      .where('_archivedAt', '<', cutoffDate.toISOString())
      .limit(1000)
      .get();
    
    for (const doc of oldArchives.docs) {
      await doc.ref.delete();
    }
    
    logger.info(`Cleaned up ${oldArchives.size} old archives`);
  }
);
```

### Disaster Recovery

#### 1. Recovery Procedures

**Restore from Backup:**
```typescript
async function restoreFromBackup(backupTimestamp: string) {
  const db = getFirestore();
  const backupDb = getFirestore('backup-project-id');
  
  const collections = ['clients', 'bookings', 'invoices'];
  
  for (const collectionName of collections) {
    const backupDocs = await backupDb
      .collection(collectionName)
      .where('_backupTimestamp', '==', backupTimestamp)
      .get();
    
    for (const doc of backupDocs.docs) {
      const originalId = doc.data()._originalDocId;
      await db.collection(collectionName).doc(originalId).set(doc.data());
    }
  }
}
```

#### 2. Point-in-Time Recovery

**Select Backup Timestamp:**
```typescript
async function listAvailableBackups(): Promise<string[]> {
  const backupDb = getFirestore('backup-project-id');
  const backups = await backupDb
    .collection('clients')
    .select('_backupTimestamp')
    .orderBy('_backupTimestamp', 'desc')
    .limit(30)
    .get();
  
  return backups.docs.map(doc => doc.data()._backupTimestamp);
}
```

#### 3. Recovery Testing

**Monthly Recovery Drills:**
- Test backup restoration monthly
- Verify data integrity
- Document recovery procedures
- Train team on recovery process

---

## Multi-Tenant Migration Path

### Migration Strategy Overview

**Current State:** Single-tenant architecture  
**Target State:** Multi-tenant SaaS platform  
**Migration Approach:** Phased migration with zero downtime

### Tenant Isolation Models

#### Option 1: Database-Per-Tenant (Recommended for Enterprise)

**Architecture:**
```
tenant-1-db.firestore.io
tenant-2-db.firestore.io
tenant-3-db.firestore.io
```

**Pros:**
- Complete data isolation
- Independent scaling
- Separate backups
- Easier compliance

**Cons:**
- Higher infrastructure cost
- Complex management
- Cross-tenant queries difficult

**Implementation:**
```typescript
// Tenant database mapping
const tenantDatabases = new Map<string, Firestore>();

function getTenantDatabase(tenantId: string): Firestore {
  if (!tenantDatabases.has(tenantId)) {
    const db = initializeFirestore(getApp(`tenant-${tenantId}`), {
      projectId: `tenant-${tenantId}`,
    });
    tenantDatabases.set(tenantId, db);
  }
  return tenantDatabases.get(tenantId);
}

// Usage
const tenantDb = getTenantDatabase(tenantId);
const clients = await getDocs(collection(tenantDb, 'clients'));
```

#### Option 2: Schema-Based Isolation (Recommended for MVP)

**Architecture:**
```
single-db.firestore.io
├── tenants/{tenantId}
│   ├── clients/{clientId}
│   ├── bookings/{bookingId}
│   └── ...
```

**Pros:**
- Lower infrastructure cost
- Easier management
- Simpler implementation
- Faster migration

**Cons:**
- Shared resources
- Potential for data leakage
- Complex security rules
- Limited isolation

**Implementation:**
```typescript
// Tenant-aware queries
function getTenantCollection(tenantId: string, collectionName: string) {
  return doc(db, `tenants/${tenantId}/${collectionName}`);
}

// Usage
const clientsRef = collection(db, `tenants/${tenantId}/clients`);
const clients = await getDocs(clientsRef);
```

### Migration Phases

#### Phase 1: Preparation (2-3 months)

**Objectives:**
- Add tenantId field to all collections
- Create default tenant for existing data
- Update security rules for tenant isolation
- Implement tenant context

**Tasks:**
1. Add `tenantId` field to all collections
2. Create default tenant document
3. Migrate existing data to default tenant
4. Update all queries to include tenant filtering
5. Implement tenant middleware
6. Update security rules
7. Add tenant-specific indexes

**Data Migration Script:**
```typescript
async function migrateToTenantSchema() {
  const db = getFirestore();
  
  // Create default tenant
  const defaultTenantRef = await addDoc(collection(db, 'tenants'), {
    name: 'Default Tenant',
    createdAt: serverTimestamp()
  });
  const defaultTenantId = defaultTenantRef.id;
  
  // Migrate clients
  const clientsSnapshot = await db.collection('clients').get();
  for (const doc of clientsSnapshot.docs) {
    await updateDoc(doc.ref, {
      tenantId: defaultTenantId
    });
  }
  
  // Migrate other collections...
}
```

#### Phase 2: Tenant Management (1-2 months)

**Objectives:**
- Implement tenant management UI
- Add tenant onboarding
- Implement tenant billing
- Add tenant-specific branding

**Tasks:**
1. Create tenant management interface
2. Implement tenant onboarding flow
3. Add tenant billing integration
4. Implement tenant branding
5. Add tenant analytics
6. Implement tenant limits

**Tenant Management Schema:**
```typescript
{
  id: string
  name: string
  status: string                    // active|suspended|trial
  plan: string                      // basic|pro|enterprise
  maxUsers: number
  maxClients: number
  branding: {
    logo: string
    primaryColor: string
    secondaryColor: string
  }
  billing: {
    planId: string
    subscriptionId: string
    nextBillingDate: string
  }
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

#### Phase 3: Feature Rollout (1-2 months)

**Objectives:**
- Roll out multi-tenant features
- Implement tenant isolation
- Add tenant-specific features
- Test multi-tenant functionality

**Tasks:**
1. Enable multi-tenant mode
2. Implement tenant isolation
3. Add tenant-specific features
4. Test multi-tenant functionality
5. Performance testing
6. Security testing

#### Phase 4: Optimization (1 month)

**Objectives:**
- Optimize multi-tenant performance
- Implement tenant-specific caching
- Add tenant monitoring
- Optimize costs

**Tasks:**
1. Implement tenant-specific caching
2. Add tenant monitoring
3. Optimize database queries
4. Implement cost optimization
5. Performance tuning

### Zero-Downtime Migration

**Strategy:**
1. Add tenantId field without breaking existing queries
2. Migrate data in background
3. Update application to use tenant-aware queries
4. Enable tenant isolation
5. Remove old query paths

**Migration Steps:**
```typescript
// Step 1: Add tenantId field (nullable)
await updateDoc(doc(db, 'clients', clientId), {
  tenantId: null  // Nullable initially
});

// Step 2: Migrate data in background
async function migrateDataInBackground() {
  const clients = await db.collection('clients').get();
  for (const doc of clients.docs) {
    if (!doc.data().tenantId) {
      await updateDoc(doc.ref, {
        tenantId: defaultTenantId
      });
    }
  }
}

// Step 3: Update application queries
// Old query (still works)
const oldQuery = query(collection(db, 'clients'), where('status', '==', 'active'));

// New query (tenant-aware)
const newQuery = query(
  collection(db, 'clients'),
  where('tenantId', '==', tenantId),
  where('status', '==', 'active')
);

// Step 4: Enable tenant isolation
// Update security rules to enforce tenantId

// Step 5: Remove old query paths
// After verification, remove non-tenant-aware queries
```

### Tenant Context Implementation

**Tenant Context Provider:**
```typescript
interface TenantContextType {
  tenantId: string;
  tenant: Tenant;
  setTenant: (tenantId: string) => void;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenantId, setTenantId] = useState<string>('');
  const [tenant, setTenant] = useState<Tenant | null>(null);
  
  useEffect(() => {
    if (tenantId) {
      loadTenant(tenantId);
    }
  }, [tenantId]);
  
  async function loadTenant(id: string) {
    const doc = await getDoc(doc(db, 'tenants', id));
    setTenant(doc.data() as Tenant);
  }
  
  return (
    <TenantContext.Provider value={{ tenantId, tenant: tenant!, setTenant }}>
      {children}
    </TenantContext.Provider>
  );
}
```

**Tenant Middleware:**
```typescript
function withTenant<P>(WrappedComponent: React.ComponentType<P & { tenantId: string }>) {
  return (props: P) => {
    const { tenantId } = useTenant();
    return <WrappedComponent {...props} tenantId={tenantId} />;
  };
}
```

### Cost Optimization for Multi-Tenant

**Cost Considerations:**
- Per-tenant database costs
- Per-tenant storage costs
- Per-tenant read/write costs
- Shared infrastructure costs

**Optimization Strategies:**
1. **Database-Per-Tenant:** Scale with tenant count
2. **Schema-Based:** Shared resources, lower cost
3. **Tiered Pricing:** Different plans for different needs
4. **Resource Limits:** Enforce limits per tenant
5. **Cost Allocation:** Track costs per tenant

**Cost Monitoring:**
```typescript
// Track costs per tenant
async function getTenantCosts(tenantId: string) {
  const costs = await getFirestore()
    .collection('tenant_costs')
    .where('tenantId', '==', tenantId)
    .orderBy('date', 'desc')
    .limit(30)
    .get();
  
  return costs.docs.map(doc => doc.data());
}
```

---

## API Architecture

### Current API State

**No REST API:** Currently, all data access is through direct Firestore SDK calls from the client.

**Issues:**
- No API layer
- No request validation
- No rate limiting
- No API versioning
- No API documentation

### Recommended API Architecture

#### API Gateway Pattern

```
Client → API Gateway → Service Layer → Repository Layer → Database
```

**Components:**

1. **API Gateway:** Request routing, validation, rate limiting
2. **Service Layer:** Business logic
3. **Repository Layer:** Data access
4. **Database:** Firestore

#### API Design Principles

1. **RESTful Design:** Use standard HTTP methods and status codes
2. **Resource-Based:** URLs represent resources
3. **Stateless:** Each request contains all necessary information
4. **Versioned:** API versioning for backward compatibility
5. **Secure:** Authentication and authorization at API level

#### API Endpoints

**Authentication:**
```
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
POST   /api/v1/auth/register
POST   /api/v1/auth/refresh
POST   /api/v1/auth/forgot-password
POST   /api/v1/auth/reset-password
```

**Users:**
```
GET    /api/v1/users
GET    /api/v1/users/{userId}
POST   /api/v1/users
PUT    /api/v1/users/{userId}
DELETE /api/v1/users/{userId}
```

**Clients:**
```
GET    /api/v1/clients
GET    /api/v1/clients/{clientId}
POST   /api/v1/clients
PUT    /api/v1/clients/{clientId}
DELETE /api/v1/clients/{clientId}
GET    /api/v1/clients/{clientId}/bookings
GET    /api/v1/clients/{clientId}/logs
GET    /api/v1/clients/{clientId}/follow-ups
```

**Bookings:**
```
GET    /api/v1/bookings
GET    /api/v1/bookings/{bookingId}
POST   /api/v1/bookings
PUT    /api/v1/bookings/{bookingId}
DELETE /api/v1/bookings/{bookingId}
POST   /api/v1/bookings/{bookingId}/payments
GET    /api/v1/bookings/{bookingId}/invoices
```

**Invoices:**
```
GET    /api/v1/invoices
GET    /api/v1/invoices/{invoiceId}
POST   /api/v1/invoices
PUT    /api/v1/invoices/{invoiceId}
DELETE /api/v1/invoices/{invoiceId}
```

**Leads:**
```
GET    /api/v1/leads
GET    /api/v1/leads/{leadId}
POST   /api/v1/leads
PUT    /api/v1/leads/{leadId}
DELETE /api/v1/leads/{leadId}
POST   /api/v1/leads/{leadId}/convert
```

**Attendance:**
```
GET    /api/v1/attendance
GET    /api/v1/attendance/{attendanceId}
POST   /api/v1/attendance
PUT    /api/v1/attendance/{attendanceId}
POST   /api/v1/attendance/punch-in
POST   /api/v1/attendance/punch-out
```

**Leaves:**
```
GET    /api/v1/leaves
GET    /api/v1/leaves/{leaveId}
POST   /api/v1/leaves
PUT    /api/v1/leaves/{leaveId}
DELETE /api/v1/leaves/{leaveId}
POST   /api/v1/leaves/{leaveId}/approve
POST   /api/v1/leaves/{leaveId}/reject
```

#### API Implementation (Firebase Functions)

**Example: Client API**
```typescript
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

export const getClients = onCall(async (request) => {
  // Authentication
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  
  // Authorization
  const userId = request.auth.uid;
  const userRole = request.auth.token.role;
  
  // Validation
  const { limit = 20, offset = 0, status } = request.data;
  
  // Query
  const db = getFirestore();
  let query = db.collection('clients');
  
  // Filter by assigned employees
  if (userRole !== 'admin') {
    query = query.where('assignedEmployees', 'array-contains', userId);
  }
  
  // Filter by status
  if (status) {
    query = query.where('status', '==', status);
  }
  
  // Pagination
  query = query.orderBy('createdAt', 'desc').limit(limit);
  
  if (offset > 0) {
    query = query.offset(offset);
  }
  
  // Execute
  const snapshot = await query.get();
  const clients = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
  
  return {
    success: true,
    data: clients,
    total: snapshot.size
  };
});

export const createClient = onCall(async (request) => {
  // Authentication
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  
  // Validation
  const { name, phone, email, ...otherData } = request.data;
  
  if (!name || !phone) {
    throw new HttpsError('invalid-argument', 'Name and phone are required.');
  }
  
  // Create client
  const db = getFirestore();
  const clientRef = await db.collection('clients').add({
    name,
    phone,
    email,
    assignedEmployees: [request.auth.uid],
    status: 'active',
    avatar: '',
    preferences: '',
    createdAt: serverTimestamp(),
    createdBy: request.auth.uid,
    updatedBy: request.auth.uid,
    ...otherData
  });
  
  return {
    success: true,
    data: {
      id: clientRef.id
    }
  };
});

export const updateClient = onCall(async (request) => {
  // Authentication
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  
  // Validation
  const { clientId, ...updates } = request.data;
  
  if (!clientId) {
    throw new HttpsError('invalid-argument', 'Client ID is required.');
  }
  
  // Authorization
  const db = getFirestore();
  const clientDoc = await db.collection('clients').doc(clientId).get();
  
  if (!clientDoc.exists) {
    throw new HttpsError('not-found', 'Client not found.');
  }
  
  const clientData = clientDoc.data();
  const userId = request.auth.uid;
  const userRole = request.auth.token.role;
  
  // Check if user can update
  if (userRole !== 'admin' && 
      userRole !== 'manager' && 
      !clientData.assignedEmployees.includes(userId)) {
    throw new HttpsError('permission-denied', 'You do not have permission to update this client.');
  }
  
  // Update client
  await db.collection('clients').doc(clientId).update({
    ...updates,
    updatedAt: serverTimestamp(),
    updatedBy: userId
  });
  
  return {
    success: true
  };
});
```

#### API Documentation

**OpenAPI/Swagger Specification:**
```yaml
openapi: 3.0.0
info:
  title: Sky Visa CRM API
  version: 1.0.0
  description: API for Sky Visa CRM

servers:
  - url: https://api.skyvisacrm.com/v1
    description: Production server

paths:
  /clients:
    get:
      summary: Get clients
      operationId: getClients
      tags:
        - Clients
      security:
        - bearerAuth: []
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
            default: 20
        - name: offset
          in: query
          schema:
            type: integer
            default: 0
        - name: status
          in: query
          schema:
            type: string
            enum: [active, inactive, lead, prospect]
      responses:
        '200':
          description: Successful response
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/Client'
                  total:
                    type: integer
    post:
      summary: Create client
      operationId: createClient
      tags:
        - Clients
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateClientRequest'
      responses:
        '200':
          description: Client created successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean
                  data:
                    type: object
                    properties:
                      id:
                        type: string

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
  
  schemas:
    Client:
      type: object
      properties:
        id:
          type: string
        name:
          type: string
        email:
          type: string
        phone:
          type: string
        status:
          type: string
          enum: [active, inactive, lead, prospect]
    
    CreateClientRequest:
      type: object
      required:
        - name
        - phone
      properties:
        name:
          type: string
        phone:
          type: string
        email:
          type: string
```

#### API Versioning

**Versioning Strategy:**
- URL-based versioning: `/api/v1/`, `/api/v2/`
- Backward compatibility for at least 2 versions
- Deprecation notice before removing versions
- Migration guides for version changes

**Version Migration:**
```typescript
// v1 API
app.get('/api/v1/clients', getClientsV1);

// v2 API (with enhanced features)
app.get('/api/v2/clients', getClientsV2);

// Deprecation notice
app.get('/api/v1/clients', (req, res) => {
  res.setHeader('X-API-Deprecation', 'This API is deprecated. Use /api/v2/clients instead.');
  getClientsV1(req, res);
});
```

---

## Event-Driven Workflow Design

### Event Architecture

**Event Types:**
- Domain Events: Business events within the system
- Integration Events: Events for external systems
- System Events: Technical events (errors, performance)

### Domain Events

#### Client Events

**ClientCreated:**
```typescript
interface ClientCreatedEvent {
  eventType: 'ClientCreated';
  clientId: string;
  clientData: Client;
  createdBy: string;
  timestamp: Timestamp;
}
```

**ClientUpdated:**
```typescript
interface ClientUpdatedEvent {
  eventType: 'ClientUpdated';
  clientId: string;
  previousData: Client;
  newData: Client;
  updatedBy: string;
  timestamp: Timestamp;
}
```

**ClientStatusChanged:**
```typescript
interface ClientStatusChangedEvent {
  eventType: 'ClientStatusChanged';
  clientId: string;
  previousStatus: string;
  newStatus: string;
  changedBy: string;
  timestamp: Timestamp;
}
```

#### Booking Events

**BookingCreated:**
```typescript
interface BookingCreatedEvent {
  eventType: 'BookingCreated';
  bookingId: string;
  clientId: string;
  bookingData: Booking;
  createdBy: string;
  timestamp: Timestamp;
}
```

**BookingConfirmed:**
```typescript
interface BookingConfirmedEvent {
  eventType: 'BookingConfirmed';
  bookingId: string;
  confirmedBy: string;
  timestamp: Timestamp;
}
```

**PaymentReceived:**
```typescript
interface PaymentReceivedEvent {
  eventType: 'PaymentReceived';
  bookingId: string;
  paymentId: string;
  amount: number;
  receivedBy: string;
  timestamp: Timestamp;
}
```

#### HR Events

**AttendanceRecorded:**
```typescript
interface AttendanceRecordedEvent {
  eventType: 'AttendanceRecorded';
  attendanceId: string;
  userId: string;
  date: string;
  punchIn: Timestamp;
  timestamp: Timestamp;
}
```

**LeaveRequested:**
```typescript
interface LeaveRequestedEvent {
  eventType: 'LeaveRequested';
  leaveId: string;
  userId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  requestedBy: string;
  timestamp: Timestamp;
}
```

**LeaveApproved:**
```typescript
interface LeaveApprovedEvent {
  eventType: 'LeaveApproved';
  leaveId: string;
  userId: string;
  approvedBy: string;
  timestamp: Timestamp;
}
```

### Event Implementation

#### Event Publisher

```typescript
class EventPublisher {
  private eventQueue: any[] = [];
  
  async publish(event: DomainEvent): Promise<void> {
    // Add to event queue
    this.eventQueue.push(event);
    
    // Persist to Firestore
    await addDoc(collection(db, 'events'), {
      ...event,
      publishedAt: serverTimestamp()
    });
    
    // Trigger event handlers
    await this.triggerHandlers(event);
  }
  
  private async triggerHandlers(event: DomainEvent): Promise<void> {
    const handlers = this.getHandlersForEvent(event.eventType);
    
    for (const handler of handlers) {
      try {
        await handler.handle(event);
      } catch (error) {
        console.error(`Error in handler ${handler.name}:`, error);
        // Continue with other handlers
      }
    }
  }
  
  private getHandlersForEvent(eventType: string): EventHandler[] {
    // Return handlers for specific event type
    return eventHandlers.filter(h => h.canHandle(eventType));
  }
}
```

#### Event Handlers

**Client Created Handler:**
```typescript
class ClientCreatedHandler implements EventHandler {
  canHandle(eventType: string): boolean {
    return eventType === 'ClientCreated';
  }
  
  async handle(event: ClientCreatedEvent): Promise<void> {
    // Send welcome email
    await this.sendWelcomeEmail(event.clientData);
    
    // Create initial follow-up
    await this.createInitialFollowUp(event.clientId);
    
    // Update analytics
    await this.updateAnalytics('client_created');
  }
  
  private async sendWelcomeEmail(client: Client): Promise<void> {
    // Email sending logic
  }
  
  private async createInitialFollowUp(clientId: string): Promise<void> {
    // Follow-up creation logic
  }
  
  private async updateAnalytics(metric: string): Promise<void> {
    // Analytics update logic
  }
}
```

**Booking Confirmed Handler:**
```typescript
class BookingConfirmedHandler implements EventHandler {
  canHandle(eventType: string): boolean {
    return eventType === 'BookingConfirmed';
  }
  
  async handle(event: BookingConfirmedEvent): Promise<void> {
    // Generate invoice
    await this.generateInvoice(event.bookingId);
    
    // Send confirmation email
    await this.sendConfirmationEmail(event.bookingId);
    
    // Update supplier
    await this.updateSupplier(event.bookingId);
    
    // Update analytics
    await this.updateAnalytics('booking_confirmed');
  }
  
  private async generateInvoice(bookingId: string): Promise<void> {
    // Invoice generation logic
  }
  
  private async sendConfirmationEmail(bookingId: string): Promise<void> {
    // Email sending logic
  }
  
  private async updateSupplier(bookingId: string): Promise<void> {
    // Supplier update logic
  }
  
  private async updateAnalytics(metric: string): Promise<void> {
    // Analytics update logic
  }
}
```

### Event Storage

**Events Collection:**
```typescript
{
  id: string
  eventType: string
  eventData: object
  publishedAt: Timestamp
  processedAt: Timestamp
  status: string                    // pending|processed|failed
  error: string
}
```

**Event Processing:**
```typescript
export const processEvents = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'Asia/Kolkata',
  },
  async () => {
    const db = getFirestore();
    
    // Get pending events
    const pendingEvents = await db
      .collection('events')
      .where('status', '==', 'pending')
      .orderBy('publishedAt', 'asc')
      .limit(100)
      .get();
    
    for (const doc of pendingEvents.docs) {
      try {
        const event = doc.data();
        
        // Process event
        await eventPublisher.triggerHandlers(event);
        
        // Mark as processed
        await updateDoc(doc.ref, {
          status: 'processed',
          processedAt: serverTimestamp()
        });
      } catch (error) {
        // Mark as failed
        await updateDoc(doc.ref, {
          status: 'failed',
          error: error.message
        });
      }
    }
  }
);
```

### Event Sourcing (Future)

**Event Store:**
```typescript
{
  id: string
  aggregateId: string
  aggregateType: string
  eventType: string
  eventData: object
  version: number
  timestamp: Timestamp
}
```

**Event Replay:**
```typescript
async function replayEvents(aggregateId: string): Promise<void> {
  const events = await db
    .collection('event_store')
    .where('aggregateId', '==', aggregateId)
    .orderBy('version', 'asc')
    .get();
  
  for (const doc of events.docs) {
    const event = doc.data();
    await applyEvent(event);
  }
}
```

---

## Scalability Architecture

### Current Scalability

**Single-Tenant Capacity:**
- Users: ~100-200
- Clients: ~1,000-5,000
- Bookings: ~5,000-10,000
- Daily Operations: ~1,000-5,000

**Limitations:**
- No horizontal scaling
- Shared resources
- Limited isolation
- Manual scaling

### Scalability Strategies

#### 1. Vertical Scaling

**Current Approach:**
- Increase instance size
- Add more memory
- Improve CPU performance

**Limitations:**
- Upper bound on resources
- Cost increases linearly
- Single point of failure

#### 2. Horizontal Scaling

**Future Approach:**
- Load balancing
- Multiple instances
- Auto-scaling

**Implementation:**
```typescript
// Use Firebase Functions auto-scaling
// No manual scaling required
// Functions scale automatically based on demand
```

#### 3. Database Scaling

**Firestore Scaling:**
- Automatic scaling
- No manual intervention
- Scales with traffic

**Optimizations:**
- Efficient queries
- Proper indexing
- Data sharding (future)

#### 4. Caching Layer

**Multi-Level Caching:**
- Browser cache
- CDN cache
- Application cache
- Database cache

**Implementation:**
```typescript
// Redis cache (future)
import Redis from 'ioredis';

const redis = new Redis();

async function getCachedData(key: string): Promise<any> {
  const cached = await redis.get(key);
  if (cached) {
    return JSON.parse(cached);
  }
  return null;
}

async function setCachedData(key: string, value: any, ttl: number): Promise<void> {
  await redis.setex(key, ttl, JSON.stringify(value));
}
```

#### 5. Microservices Architecture (Future)

**Service Boundaries:**
- User Service
- Client Service
- Booking Service
- Invoice Service
- HR Service
- Notification Service

**Implementation:**
```typescript
// Each service as separate Firebase project
// Service communication via HTTP/gRPC
// Event-driven communication
```

### Performance Optimization

#### 1. Query Optimization

**Best Practices:**
- Use indexes
- Limit results
- Select only needed fields
- Avoid array-contains with large arrays

#### 2. Code Optimization

**Best Practices:**
- Code splitting
- Lazy loading
- Tree shaking
- Bundle optimization

#### 3. Network Optimization

**Best Practices:**
- CDN usage
- Image optimization
- Compression
- HTTP/2

### Load Testing

**Test Scenarios:**
- 100 concurrent users
- 1,000 concurrent users
- 10,000 concurrent users

**Tools:**
- k6
- Locust
- Apache JMeter

---

## Monitoring and Observability

### Monitoring Strategy

#### 1. Application Monitoring

**Firebase Performance Monitoring:**
```typescript
import { getPerformance, trace } from 'firebase/performance';

const perf = getPerformance();

// Custom trace
const t = trace(perf, 'client_query');
t.start();

// Execute query
const clients = await getClients();

t.stop();
```

#### 2. Error Monitoring

**Firebase Crashlytics:**
```typescript
import * as Crashlytics from '@firebase/crashlytics';

try {
  // Application code
} catch (error) {
  Crashlytics.recordError(error);
}
```

#### 3. Custom Metrics

**Business Metrics:**
- Daily active users
- New clients
- Bookings created
- Revenue generated

**Technical Metrics:**
- API response times
- Database query times
- Error rates
- Cache hit rates

### Logging Strategy

#### 1. Structured Logging

```typescript
interface LogEntry {
  level: 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, any>;
  timestamp: string;
  userId?: string;
  requestId?: string;
}

function log(entry: LogEntry): void {
  console.log(JSON.stringify(entry));
  
  // Send to logging service
  sendToLogService(entry);
}
```

#### 2. Log Levels

**Info:** Normal operations
**Warn:** Potential issues
**Error:** Errors requiring attention
**Debug:** Detailed debugging information

#### 3. Log Aggregation

**Tools:**
- Firebase Crashlytics
- Cloud Logging (future)
- ELK Stack (future)

### Alerting Strategy

#### 1. Alert Types

**Critical Alerts:**
- System down
- Database errors
- Security breaches
- Data loss

**Warning Alerts:**
- High error rate
- Slow response times
- High resource usage

**Info Alerts:**
- Deployment notifications
- Scheduled maintenance
- Performance reports

#### 2. Alert Channels

**Channels:**
- Email
- Slack
- SMS
- PagerDuty (critical)

#### 3. Alert Thresholds

**Error Rate:**
- Warning: > 1%
- Critical: > 5%

**Response Time:**
- Warning: > 1s
- Critical: > 5s

**Resource Usage:**
- Warning: > 70%
- Critical: > 90%

### Dashboard

**Key Metrics:**
- Active users
- System health
- Error rates
- Response times
- Resource usage

**Tools:**
- Firebase Console
- Grafana (future)
- Custom dashboard

---

## Disaster Recovery

### Recovery Objectives

**RPO (Recovery Point Objective):** 1 hour  
**RTO (Recovery Time Objective):** 4 hours

### Recovery Strategies

#### 1. Backup Strategy

**Daily Backups:**
- Automated daily backups
- 30-day retention
- Backup verification

**Point-in-Time Recovery:**
- Select any backup timestamp
- Restore to specific point in time
- Test recovery regularly

#### 2. Failover Strategy

**Primary Region:** us-central1  
**Secondary Region:** us-east1 (future)

**Failover Process:**
1. Detect failure
2. Switch to secondary region
3. Update DNS
4. Verify services
5. Monitor performance

#### 3. Data Recovery

**Recovery Procedures:**
1. Identify failure scope
2. Select appropriate backup
3. Restore data
4. Verify integrity
5. Update applications

### Testing

**Regular Testing:**
- Monthly backup restoration tests
- Quarterly failover drills
- Annual disaster recovery simulation

**Documentation:**
- Recovery procedures
- Contact information
- Escalation procedures
- Communication plan

---

## Compliance and Governance

### Data Protection

**GDPR Compliance:**
- Data minimization
- Right to access
- Right to erasure
- Data portability

**Implementation:**
```typescript
// Data deletion request
async function handleDataDeletionRequest(userId: string): Promise<void> {
  // Delete user data
  await deleteDoc(doc(db, 'users', userId));
  
  // Delete or anonymize client data
  // Delete bookings
  // Delete logs
  // Confirm deletion
}
```

### Audit Trail

**Audit Logging:**
- All data access logged
- All modifications logged
- User actions logged
- System events logged

**Implementation:**
```typescript
await logAuditEvent({
  action: 'client_updated',
  userId: currentUser.uid,
  resourceType: 'client',
  resourceId: clientId,
  changes: updates,
  success: true
});
```

### Access Control

**RBAC:**
- Role-based access control
- Principle of least privilege
- Regular access reviews
- Access revocation on exit

### Data Retention

**Retention Policies:**
- Active data: Indefinite
- Archived data: 7 years
- Audit logs: 3 years
- Error logs: 1 year

---

## Future Roadmap

### Phase 1: Foundation (Current)

**Status:** In Progress  
**Timeline:** Q3 2026

**Deliverables:**
- Complete single-tenant strengthening
- Implement security improvements
- Add monitoring and logging
- Optimize performance

### Phase 2: Multi-Tenant Foundation

**Status:** Planned  
**Timeline:** Q4 2026 - Q1 2027

**Deliverables:**
- Implement tenant isolation
- Add tenant management
- Implement tenant billing
- Add tenant-specific features

### Phase 3: Advanced Features

**Status:** Planned  
**Timeline:** Q2 2027 - Q3 2027

**Deliverables:**
- GDS integration
- Payment gateway integration
- Mobile applications
- AI-powered features

### Phase 4: Enterprise Features

**Status:** Planned  
**Timeline:** Q4 2027 - Q1 2028

**Deliverables:**
- API marketplace
- Webhook system
- Advanced analytics
- Multi-region deployment

---

## Conclusion

This Enterprise Architecture Document provides a comprehensive blueprint for the Sky Visa CRM system. The architecture is designed to support the current single-tenant operation while providing a clear path to multi-tenant SaaS transformation.

### Key Takeaways

1. **Solid Foundation:** The current architecture provides a solid foundation for growth
2. **Scalability:** The system is designed to scale with business needs
3. **Security:** Comprehensive security measures protect data and users
4. **Flexibility:** The architecture can adapt to changing requirements
5. **Migration Path:** Clear path to multi-tenant transformation

### Next Steps

1. **Immediate:** Implement security and performance improvements
2. **Short-term:** Begin multi-tenant foundation work
3. **Medium-term:** Roll out multi-tenant features
4. **Long-term:** Implement advanced enterprise features

### Success Criteria

- System reliability > 99.5%
- Performance targets met
- Security compliance achieved
- Multi-tenant migration successful
- User satisfaction > 90%

---

**Document Version:** 1.0  
**Last Updated:** July 9, 2026  
**Next Review:** October 9, 2026  
**Maintained By:** Architecture Team
