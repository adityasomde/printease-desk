import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { vi, test, expect } from "vitest";
import TrackPage from "../TrackPage";

test("displays pending manual payment details and UPI QR image", async () => {
  const order = {
    id: "ORD123",
    amount: 80,
    paymentStatus: "Pending",
    centre: "Test Centre",
    document: "File.pdf",
    pickupCode: "P123",
  };

  const pendingPayment = { id: "pay_1", createdAt: new Date().toISOString() };
  const qrUrl = "https://example.com/qr.png";
  const onPayOnline = vi.fn();
  const onCreateUpiQr = vi.fn();

  render(
    <TrackPage
      order={order}
      lastUpdatedAt={new Date().toISOString()}
      pendingPayment={pendingPayment}
      upiQr={null}
      centreUpiId="test@upi"
      centreUpiQrImageUrl={qrUrl}
      onPayOnline={onPayOnline}
      onCreateUpiQr={onCreateUpiQr}
      onSimulateVerifiedPayment={null}
      paymentLoading={false}
      paymentError={""}
    />
  );

  expect(screen.getByText(/payment request pending/i)).toBeTruthy();
  expect(screen.getByText(/test@upi/i)).toBeTruthy();
  expect(screen.getByAltText(/centre upi qr/i).getAttribute("src")).toBe(qrUrl);

  fireEvent.click(screen.getByRole("button", { name: /pay online/i }));
  fireEvent.click(screen.getByRole("button", { name: /generate upi qr/i }));
  expect(onPayOnline).toHaveBeenCalled();
  expect(onCreateUpiQr).toHaveBeenCalled();
});
