import { redirect } from "next/navigation";

// Landingsroute. De proxy stuurt niet-ingelogde bezoekers naar /login.
export default function Home() {
  redirect("/landgoederen");
}
