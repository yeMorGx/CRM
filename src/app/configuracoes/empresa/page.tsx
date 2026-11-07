import Home from "../../page";

export default function CompanySettingsPage() {
  return <Home searchParams={Promise.resolve({ view: "company" })} />;
}
