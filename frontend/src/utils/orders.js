export function createPrintOrder({ selectedCentre, documentName, pages, copies, totalAmount }) {
  const pickupCode = String(Math.floor(1000 + Math.random() * 9000));

  return {
    id: `PRN-${selectedCentre.code}-${pickupCode}`,
    centreCode: selectedCentre.code,
    centre: selectedCentre.name,
    document: documentName || "Uploaded Document",
    pages: Number(pages),
    copies: Number(copies),
    amount: totalAmount,
    status: "Payment Verified",
    date: "Today",
    paymentStatus: "Verified",
    pickupCode,
  };
}
