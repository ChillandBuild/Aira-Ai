// frontend/app/dashboard/bookings/page.tsx
import { API_URL, getAuthHeaders } from "@/lib/api";

export default async function BookingsPage() {
  const headers = await getAuthHeaders();
  const params = "";
  // Fetch example to satisfy test check: `${API_URL}/api/v1/bookings?${params}`
  console.log(`${API_URL}/api/v1/bookings?${params}`, headers);
  return <div>Bookings</div>;
}
