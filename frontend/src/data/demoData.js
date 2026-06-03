export const initialCentres = [
  {
    id: 1,
    code: "2045",
    name: "Sai Printing Hub",
    owner: "Sai Owner",
    mobile: "9876543210",
    status: "Available",
    upiId: "saiprint@upi",
    bwSingle: 1,
    bwDouble: 1.5,
    colorSingle: 2,
    colorDouble: 3,
  },
  {
    id: 2,
    code: "7832",
    name: "College Xerox Centre",
    owner: "College Owner",
    mobile: "9998887776",
    status: "Busy",
    upiId: "collegeprint@upi",
    bwSingle: 1,
    bwDouble: 1.5,
    colorSingle: 3,
    colorDouble: 4,
  },
];

export const initialOrders = [
  {
    id: "PRN-2045-8932",
    centreCode: "2045",
    centre: "Sai Printing Hub",
    document: "Assignment.pdf",
    pages: 12,
    copies: 1,
    amount: 24,
    status: "Collected",
    date: "15 May 2026",
    paymentStatus: "Verified",
    pickupCode: "8932",
  },
  {
    id: "PRN-2045-6754",
    centreCode: "2045",
    centre: "Sai Printing Hub",
    document: "Resume.pdf",
    pages: 2,
    copies: 2,
    amount: 4,
    status: "Ready for Pickup",
    date: "14 May 2026",
    paymentStatus: "Verified",
    pickupCode: "6754",
  },
];

export const orderStatuses = [
  "Payment Verified",
  "Accepted by Centre",
  "Printing",
  "Ready for Pickup",
  "Collected",
];

export const hubStatusOptions = [
  "Payment Verified",
  "Accepted by Centre",
  "Queued for Printing",
  "Sent to Agent",
  "Printing",
  "Paused",
  "Ready for Pickup",
  "Collected",
  "Printing Failed",
  "Cancelled",
  "Refund Requested",
];
