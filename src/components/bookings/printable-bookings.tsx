'use client';

import type { Booking, Client } from '@/lib/types';
import { buildDetailEntries, bookingReference } from '@/lib/booking-details';
import { format } from 'date-fns';
import { PrintSettings } from './print-settings-dialog';

interface PrintableBookingsProps {
  client: Client;
  bookings: Booking[];
  settings: PrintSettings;
}

export function PrintableBookings({ client, bookings, settings }: PrintableBookingsProps) {
  const sortedBookings = [...bookings].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );

  return (
    <div className="print-container bg-white p-8 max-w-[210mm] mx-auto">
      {/* Header */}
      <div className="border-b-2 border-gray-800 pb-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Booking Summary</h1>
        <div className="mt-2 text-sm text-gray-600">
          <p><span className="font-medium">Client:</span> {client.name}</p>
          <p><span className="font-medium">Phone:</span> {client.phone}</p>
          {client.email && <p><span className="font-medium">Email:</span> {client.email}</p>}
          <p><span className="font-medium">Print Date:</span> {format(new Date(), 'dd MMM yyyy, HH:mm')}</p>
        </div>
      </div>

      {/* Bookings */}
      {sortedBookings.map((booking, index) => {
        const ref = bookingReference(booking);
        const detailEntries = buildDetailEntries(booking);
        
        return (
          <div key={booking.id} className="mb-6 page-break-inside-avoid">
            {/* Booking Header */}
            <div className="bg-gray-50 p-4 rounded-t-lg border border-gray-200">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {booking.bookingType?.charAt(0).toUpperCase() + booking.bookingType?.slice(1) || 'Booking'} #{index + 1}
                  </h2>
                  {settings.showReferences && ref && (
                    <p className="text-sm text-gray-600 mt-1">
                      <span className="font-medium">{ref.label}:</span> {ref.value}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                    booking.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                    booking.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    booking.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {booking.status?.charAt(0).toUpperCase() + booking.status?.slice(1)}
                  </span>
                </div>
              </div>
              
              <div className="mt-3 text-sm text-gray-700">
                <p>
                  <span className="font-medium">Dates:</span>{' '}
                  {format(new Date(booking.startDate), 'dd MMM yyyy')} - {format(new Date(booking.endDate), 'dd MMM yyyy')}
                </p>
                {booking.destination && (
                  <p><span className="font-medium">Destination:</span> {booking.destination}</p>
                )}
              </div>
            </div>

            {/* Booking Details */}
            <div className="border border-t-0 border-gray-200 rounded-b-lg p-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                {detailEntries.map((entry) => {
                  // Skip portal if setting is disabled
                  if (entry.label === 'Portal' && !settings.showPortal) return null;
                  // Skip supplier if setting is disabled
                  if (entry.label === 'Supplier' && !settings.showSupplier) return null;
                  
                  if (entry.isTable && Array.isArray(entry.value)) {
                    return (
                      <div key={entry.label} className="col-span-2">
                        <h3 className="font-medium text-gray-900 mb-2">{entry.label}</h3>
                        <table className="w-full border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-gray-300">
                              <th className="py-2 px-3 text-left font-medium text-gray-700">From</th>
                              <th className="py-2 px-3 text-left font-medium text-gray-700">To</th>
                              <th className="py-2 px-3 text-left font-medium text-gray-700">Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {entry.value.map((row: any, idx: number) => (
                              <tr key={idx} className="border-b border-gray-200 last:border-0">
                                <td className="py-2 px-3">{row.from}</td>
                                <td className="py-2 px-3">{row.to}</td>
                                <td className="py-2 px-3">{row.date}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  }
                  
                  return (
                    <div key={entry.label} className="col-span-1">
                      <span className="text-gray-600">{entry.label}:</span>{' '}
                      <span className="text-gray-900 font-medium">{entry.value}</span>
                    </div>
                  );
                })}
              </div>

              {/* Financial Information */}
              {(settings.showPrices || settings.showCost || settings.showProfit) && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <h3 className="font-medium text-gray-900 mb-2 text-sm">Financial Details</h3>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    {settings.showPrices && (
                      <div>
                        <span className="text-gray-600">Customer Price:</span>{' '}
                        <span className="text-gray-900 font-medium">₹{(booking.total || 0).toLocaleString()}</span>
                      </div>
                    )}
                    {settings.showCost && (
                      <div>
                        <span className="text-gray-600">Supplier Cost:</span>{' '}
                        <span className="text-gray-900 font-medium">₹{(booking.supplierCost || 0).toLocaleString()}</span>
                      </div>
                    )}
                    {settings.showProfit && (
                      <div>
                        <span className="text-gray-600">Profit:</span>{' '}
                        <span className={`font-medium ${booking.profit ?? ((booking.total || 0) - (booking.supplierCost || 0)) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          ₹{(booking.profit ?? ((booking.total || 0) - (booking.supplierCost || 0))).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Remarks */}
              {settings.showRemarks && booking.remarks && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <h3 className="font-medium text-gray-900 mb-2 text-sm">Remarks</h3>
                  <p className="text-sm text-gray-700">{booking.remarks}</p>
                </div>
              )}

              {/* Timeline */}
              {settings.showTimeline && booking.timeline && booking.timeline.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <h3 className="font-medium text-gray-900 mb-2 text-sm">Timeline</h3>
                  <div className="space-y-2 text-xs">
                    {booking.timeline.map((event, idx) => (
                      <div key={idx} className="flex gap-2">
                        <span className="text-gray-500 whitespace-nowrap">
                          {event.createdAt ? format(new Date(event.createdAt), 'dd MMM yyyy, HH:mm') : ''}
                        </span>
                        <span className="text-gray-700">
                          <span className="font-medium">{event.userName}</span>: {event.action}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Documents */}
              {settings.showDocuments && booking.documents && booking.documents.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <h3 className="font-medium text-gray-900 mb-2 text-sm">Documents</h3>
                  <ul className="text-sm text-gray-700 list-disc list-inside">
                    {booking.documents.map((doc, idx) => (
                      <li key={idx}>{doc.name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Footer */}
      <div className="mt-8 pt-4 border-t border-gray-300 text-center text-xs text-gray-500">
        <p>Generated by Sky Visa CRM</p>
        <p className="mt-1">This document is confidential and intended for the addressee only.</p>
      </div>
    </div>
  );
}
