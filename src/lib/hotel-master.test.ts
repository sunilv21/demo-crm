import test from 'node:test';
import assert from 'node:assert/strict';
import { findHotelNameConflict } from './hotel-master';

test('findHotelNameConflict detects duplicate name across active hotels', () => {
  const hotels = [
    { id: '1', hotelName: 'Grand Plaza', active: true },
    { id: '2', hotelName: 'Ocean View', active: false },
  ];

  assert.equal(findHotelNameConflict(hotels, 'grand plaza', '3'), 'Grand Plaza');
  assert.equal(findHotelNameConflict(hotels, 'Ocean View', '2'), null);
  assert.equal(findHotelNameConflict(hotels, 'New Hotel', '3'), null);
});
