import Home from "../page";

export default function PlansPage() {
  return <Home searchParams={Promise.resolve({ view: "plans" })} />;
}
