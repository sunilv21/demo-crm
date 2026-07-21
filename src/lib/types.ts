
export type PaxType = 'adult' | 'child' | 'infant';

export type Companion = {
    name: string;
    type?: PaxType;
};

export type User = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  jobTitle?: string;
  avatar?: string;
  role: 'employee' | 'manager' | 'admin' | 'agent' | 'finance';
  baseSalary?: number;
  workStartTime?: string;
  workEndTime?: string;
  lateGraceMinutes?: number;
  monthlyLeaveCap?: number;
  dailyBreakCapMinutes?: number;
  createdAt?: any;
  updatedAt?: any;
  createdBy?: string;
  updatedBy?: string;
};

export type AttendanceStatus =
  | 'present'
  | 'late'
  | 'half-day'
  | 'absent'
  | 'leave'
  | 'holiday'
  | 'upcoming';

export type BreakSource = 'manual' | 'screen-lock' | 'personal';

export type AttendanceBreak = {
  id: string;            // uuid generated client-side
  start: any;            // Firestore Timestamp
  end?: any | null;      // null while ongoing
  source: BreakSource;
  durationMinutes?: number;
};

export type Attendance = {
  id: string;
  userId: string;
  userName: string;
  date: string;
  punchIn: any;
  punchOut?: any;
  workStartTime: string;
  workEndTime: string;
  lateGraceMinutes: number;
  punchInLate: boolean;
  punchOutEarly: boolean;
  autoLoggedOut: boolean;
  workMinutes?: number;
  status: AttendanceStatus;
  notes?: string;
  // Break / away tracking. `breaks` is an ordered list; the LAST entry with
  // end == null is the one currently in progress (if any). `breakMinutes` is
  // the rolling total of CLOSED breaks for fast UI rendering.
  breaks?: AttendanceBreak[];
  breakMinutes?: number;
  // Active = workMinutes - breakMinutes (computed at punch-out and on the fly).
  activeMinutes?: number;
  /** Heartbeat written by client every minute while app is open and punched in.
   * Gaps in this timestamp are reconciled into screen-lock breaks on next login. */
  lastActiveAt?: any;
  createdAt: any;
  updatedAt: any;
};

export type LeaveType = 'casual' | 'sick' | 'earned' | 'lop';

export type LeaveStatus = 'pending' | 'approved' | 'rejected';

export type Leave = {
  id: string;
  userId: string;
  userName: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  approvedBy?: string;
  approvedAt?: any;
  rejectedBy?: string;
  rejectedAt?: any;
  rejectionReason?: string;
  createdAt: any;
  updatedAt: any;
};

export type Holiday = {
  id: string;
  date: string;
  name: string;
  createdAt: any;
  createdBy: string;
};

export type RequiredDocument = {
  name: string;
  status: 'pending' | 'uploaded' | 'verified' | 'received';
};

export type VisaHistoryItem = {
  country: string;
  status: 'approved' | 'rejected';
  date: string;
  rejectionReason?: string;
};

export type PreviousTrip = {
  country: string;
  startDate: string;
  endDate: string;
};

// A corporate account that groups multiple clients. The org holds no bookings
// or money of its own — its totals are the roll-up of its member clients'
// bookings (computed on read). See the /organizations pages.
export type Organization = {
  id: string;
  name: string;
  type: 'corporate';
  contactPerson?: string;
  email?: string;
  phone?: string;
  gstNumber?: string;
  billingAddress?: string;
  notes?: string;
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
};

// Hotel Master — created once, then reused across bookings (auto-filling the
// booking form) and vouchers (Terms & Conditions are fetched from here
// instead of being retyped per booking).
export type Hotel = {
  id: string;
  name: string;
  city?: string;
  country?: string;
  address?: string;
  phone?: string;
  termsAndConditions?: string; // free text, one bullet per line — printed on this hotel's vouchers
  notes?: string; // anything else worth recording about this hotel
  active: boolean;
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
};

export type Client = {
  id:string;
  name: string;
  // When set, this client belongs to a corporate Organization (one org per
  // client). Empty/undefined means a standalone individual. The client still
  // appears normally in the Clients list either way.
  organizationId?: string;
  email?: string;
  phone: string;
  avatar: string;
  preferences: string;
  status: 'active' | 'inactive' | 'lead' | 'prospect';
  dateOfBirth?: string;
  gender?: 'male' | 'female' | 'other';
  nationality?: string;
  preferredDestination?: string;
  travelPurpose?: string;
  preferredTravelDates?: { from?: string; to?: string };
  // Multi-destination itinerary: each country visited on the trip with its dates
  tripDestinations?: { destination?: string; from?: string; to?: string }[];
  budget?: number;
  hotelPreference?: string;
  services?: ('flight' | 'hotel' | 'visa' | 'transfers' | 'activity' | 'localTours')[];
  additionalServices?: ('travelInsurance' | 'airportPickup' | 'localTours')[];
  assignedEmployees?: string[];
  visaStatus?: 'toStart' | 'inProcess' | 'applied' | 'approved' | 'rejected' | 'completed' | 'travelling';
  visaHistory?: VisaHistoryItem[];
  previousTrips?: PreviousTrip[];
  requiredDocuments?: RequiredDocument[];
  followUpDate?: string;
  pax?: number;
  companions?: Companion[];
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
};

export type LeadStatus = 'new' | 'contacted' | 'proposal' | 'won' | 'lost';

export type Lead = {
  id: string;
  name: string;
  email?: string;
  phone: string;
  avatar: string;
  status: LeadStatus;
  source?: string;
  // Richer optional detail captured from website leads / for conversion.
  nationality?: string;
  preferredDestination?: string;
  travelPurpose?: string;
  preferredTravelDates?: { from?: string; to?: string };
  budget?: number;
  pax?: number;
  notes?: string;
  // Set when a lead has been converted into a client record.
  convertedToClientId?: string;
  convertedAt?: any;
  // Fields written by the external marketing website (/api/leads relay).
  // It uses `destination`/`message` rather than preferredDestination/notes,
  // and prefixes source as `website:<form>`.
  destination?: string;
  message?: string;
  rawPayload?: Record<string, any>;
  localRef?: { collection: string; id: string } | null;
  sourceWebsite?: string;
  phoneDigits?: string;
  phoneSuffix10?: string;
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
};

export type BookingType =
| 'flight'
| 'hotel'
| 'car'
| 'activity'
| 'visa'
| 'other';

export type BookingStatus =
  | 'draft'
  | 'pending'
  | 'hold'
  | 'confirmed'
  | 'cancelled';

export type PaymentStatus =
| 'unpaid'
| 'partial'
| 'paid'
| 'refunded';

export type PaymentMode = 'cash' | 'card' | 'upi' | 'bank' | 'cheque' | 'other';

// A single installment/receipt against a booking.
export type Payment = {
  id: string;
  amount: number;
  date: string; // ISO date the payment was received
  mode: PaymentMode;
  reference?: string;
  note?: string;
  createdAt?: any;
  createdBy?: string;
  createdByName?: string;
  // Id of the linked Finance income transaction (booking payments flow into the
  // Finance module). Used to cancel that transaction if the payment is removed.
  financeTxnId?: string;
};

export type Booking = {
  id: string;

  // Client
  clientId: string;
  clientName: string;

  // Sales agent who OWNS this booking for revenue attribution. Auto-set to the
  // first agent who adds pricing (Cost Breakdown); if unset, attribution falls
  // back to createdBy when the creator is an agent. Separates "who sold it" from
  // "who typed it in" (an employee can create; an agent can own).
  agentId?: string;

  // Booking
  bookingType: BookingType;
  destination?: string;

  // Flight-specific
  isOneWay?: boolean;
  hasLayover?: boolean;
  layoverAirport?: string;
  isMultiCity?: boolean;
  sectors?: {
    origin?: string;
    destination?: string;
    departure?: string;
    cabinClass?: string;
    flightNumber?: string;
    airportCode?: string;
  }[];

  // Flight passenger names (the traveller(s) the ticket is booked for)
  flightPassengers?: { name?: string }[];

  // Visa applicants (one row per person on a visa booking)
  visaApplicants?: {
    name?: string;
    passportNumber?: string;
    validFrom?: string;
    validUntil?: string;
  }[];

  // Hotel guest names (printed on the voucher)
  hotelGuests?: { name?: string }[];

  // Portal the booking was made through (flight/hotel/etc.)
  bookingPortal?: string;

  startDate: string;
  endDate: string;

  status: BookingStatus;
  progress: number;

  // Financials
  total: number;
  amountPaid?: number;
  balanceAmount?: number;
  paymentStatus?: PaymentStatus;
  // Installment ledger. amountPaid/balanceAmount are kept in sync as a cache.
  payments?: Payment[];

  // Supplier
  supplierName?: string;
  supplierCost?: number;
  supplierReference?: string;

  // Profit = total (customer price) − supplierCost (booking price)
  profit?: number;

  // Generic Dynamic Data
  bookingDetails?: Record<string, any>;

  // Documents
  documents?: {
  name: string;
  url?: string;
  uploadedAt?: any;
  }[];

  // Notes
  remarks?: string;

  // Cancellation & refund (populated when status === 'cancelled').
  //   cancellationCharges = amount the agency retains (cancellation fee)
  //   refundAmount        = amount owed back to the customer (paid − charges)
  //   refundStatus        = 'pending' until the money is actually returned
  cancellationReason?: string;
  cancelledAt?: string;
  cancellationCharges?: number;
  refundAmount?: number;
  refundStatus?: 'pending' | 'processed';
  refundedAt?: string;
  refundMode?: PaymentMode;
  refundReference?: string;

  // Archival: once a booking is fully paid it can be archived out of the active
  // bookings list into the client's Travel History (keeps the list uncluttered).
  // Archives manually, or automatically 15 days after the full payment is received.
  archived?: boolean;
  archivedAt?: any;
  // Set when a booking is manually un-archived, so the 15-day auto-archive rule
  // doesn't immediately pull it back into Travel History.
  archiveExempt?: boolean;

  // Timeline
  timeline?: {
  action: string;
  userId: string;
  userName: string;
  createdAt: any;
  }[];

  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
};


export type Invoice = {
  id: string;
  bookingId: string;
  clientName: string;
  amount: number;
  dueDate: string;
  status: 'paid' | 'unpaid' | 'overdue';
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
};

export type CustomerLog = {
  id: string;
  clientId: string;
  clientName?: string;
  userName?: string;
  activity: string;
  userId: string;
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
};

export type FollowUp = {
  id: string;
  clientId: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  date: string;
  notes: string | null;
  done: boolean;
  priority: 'low' | 'medium' | 'high';
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
};

// ---------------------------------------------------------------------------
// Finance module (company cash flow) — visible to admin + finance role only.
// Balances are computed on read from transactions (see src/lib/finance.ts);
// no stored currentBalance is mutated.
// ---------------------------------------------------------------------------

export type FinanceAccountType = 'cash' | 'petty-cash' | 'current' | 'savings' | 'wallet';

export type FinanceAccount = {
  id: string;
  name: string;
  type: FinanceAccountType;
  bankName?: string;
  accountNumber?: string;
  ifsc?: string;
  openingBalance: number;
  status: 'active' | 'inactive';
  notes?: string;
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
};

export type FinanceSupplier = {
  id: string;
  name: string;
  category?: string; // e.g. VFS, Airline, Hotel, Courier, Utilities, Employee
  contactPerson?: string;
  phone?: string;
  email?: string;
  gst?: string;
  address?: string;
  notes?: string;
  status: 'active' | 'inactive';
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
};

export type ExpenseCategory = {
  id: string;
  name: string;
  active: boolean;
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
};

export type PaymentMethodDoc = {
  id: string;
  name: string;
  direction: 'incoming' | 'outgoing';
  requiresReference?: boolean;
  requiresAttachment?: boolean;
  active?: boolean;
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
};

// An expense logged by an agent (money they spent on the business). It is a
// PENDING REIMBURSEMENT — NOT a company expense until finance reimburses the
// agent. Reimbursing creates a real finance transaction (the company expense).
export type AgentExpense = {
  id: string;
  amount: number;
  date: string; // ISO date
  category?: string; // what kind of spend
  purpose?: string;  // what it was for (description)
  payee?: string;    // where / to whom
  paymentMethod?: string; // how the agent paid (Cash / UPI / …)
  // Reimbursement (set by finance when the company pays the agent back).
  reimbursed?: boolean;
  reimbursedAt?: string;
  reimbursedTxnId?: string; // the finance_transactions expense created on payout
  createdAt: any;
  createdBy: string;
  createdByName?: string;
  updatedAt: any;
  updatedBy: string;
};

export type FinanceTxnType = 'income' | 'expense' | 'transfer';
export type FinanceTxnStatus = 'completed' | 'cancelled';

export type FinanceTransaction = {
  id: string;
  type: FinanceTxnType;
  amount: number;
  date: string; // ISO date
  // For income → destination account; expense → source account;
  // transfer → source (from) account, with toAccountId as destination.
  accountId: string;
  toAccountId?: string;
  // Optional links to the commercial records.
  clientId?: string;
  clientName?: string;
  bookingId?: string;
  invoiceId?: string;
  supplierId?: string;
  supplierName?: string;
  categoryId?: string;
  categoryName?: string;
  paymentMethod?: string;
  reference?: string;
  remarks?: string;
  status: FinanceTxnStatus;
  // 'booking' = derived from a booking payment; 'agent' = derived from an
  // agent-logged expense; 'manual' = entered in the Finance module.
  source?: 'booking' | 'agent' | 'manual';
  bookingPaymentId?: string;
  createdAt: any;
  createdBy: string;
  createdByName?: string;
  updatedAt: any;
  updatedBy: string;
};
