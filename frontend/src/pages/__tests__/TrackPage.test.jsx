import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { vi, test, expect } from "vitest";
import TrackPage from "../TrackPage";

test("calls onPayOnline and onCreateUpiQr and displays UPI QR image", async () => {
  const onPayOnline = vi.fn();
  const onCreateUpiQr = vi.fn();

  const order = {
    id: "ORD123",
    amount: 80,
    paymentStatus: "Pending",
    centre: "Test Centre",
    document: "File.pdf",
    pickupCode: "P123",
  };

  const pendingPayment = { id: "pay_1" };
  const upiQr = { imageUrl: "https://example.com/qr.png" };

  render(
    <TrackPage
      order={order}
      lastUpdatedAt={new Date().toISOString()}
      pendingPayment={pendingPayment}
      upiQr={upiQr}
      onPayOnline={onPayOnline}
      onCreateUpiQr={onCreateUpiQr}
      onSimulateVerifiedPayment={null}
      paymentLoading={false}
      paymentError={""}
    />
  );

  const payBtn = screen.getByRole("button", { name: /pay online/i });
  fireEvent.click(payBtn);
  expect(onPayOnline).toHaveBeenCalled();

  const genBtn = screen.getByRole("button", { name: /generate upi qr/i });
  fireEvent.click(genBtn);
  expect(onCreateUpiQr).toHaveBeenCalled();

  const img = screen.getByAltText(/razorpay upi qr/i);
  expect(img.getAttribute("src")).toBe(upiQr.imageUrl);
});
