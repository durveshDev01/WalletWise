import { Redirect } from 'expo-router';

/** Legacy entry point: card creation is catalog-backed so reward facts are not fabricated. */
export default function CreateCardScreen() {
  return <Redirect href="/add-card" />;
}
