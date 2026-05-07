import { Client, Booking, Invoice, User, CustomerLog } from './types';
import { PlaceHolderImages } from './placeholder-images';

export const mockUser: User = {
  id: 'user-1',
  name: 'Alex Doe',
  email: 'alex.doe@skyvisa.com',
  avatar: PlaceHolderImages.find(p => p.id === 'user1')?.imageUrl || '',
  role: 'admin',
};

export const mockClients: Client[] = [
  
];

export const mockBookings: Booking[] = [];
export const mockInvoices: Invoice[] = [
  { id: 'invoice-1', bookingId: 'booking-1', clientName: 'John Smith', amount: 8500, dueDate: '2024-06-01', status: 'paid', createdAt: null, updatedAt: null, createdBy: 'seed', updatedBy: 'seed' },
  { id: 'invoice-2', bookingId: 'booking-2', clientName: 'Jane Doe', amount: 3200, dueDate: '2024-07-15', status: 'unpaid', createdAt: null, updatedAt: null, createdBy: 'seed', updatedBy: 'seed' },
  { id: 'invoice-3', bookingId: 'booking-4', clientName: 'Natasha Romanoff', amount: 4500, dueDate: '2024-09-01', status: 'unpaid', createdAt: null, updatedAt: null, createdBy: 'seed', updatedBy: 'seed' },
  { id: 'invoice-4', bookingId: 'booking-x', clientName: 'Peter Pan', amount: 1200, dueDate: '2024-05-20', status: 'overdue', createdAt: null, updatedAt: null, createdBy: 'seed', updatedBy: 'seed' },
];

export const mockCustomerLogs: CustomerLog[] = [];

export const mockCustomerLogsWithFollowUp = [];
