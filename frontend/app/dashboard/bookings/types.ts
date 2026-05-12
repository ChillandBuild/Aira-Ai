export interface Booking {
  id: string;
  booking_ref: string | null;
  devotee_name: string | null;
  rasi: string | null;
  nakshatram: string | null;
  status: string;
  payment_link: string | null;
  confirmed_at: string | null;
  created_at: string;
  leads: { name: string | null; phone: string } | null;
}
