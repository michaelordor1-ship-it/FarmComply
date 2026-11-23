"use client";

export default function PrintButton() {
  return (
    <button type="button" className="primary-btn" onClick={() => window.print()}>
      Save as PDF / Print
    </button>
  );
}
