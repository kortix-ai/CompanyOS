import { HomeAuthGate } from './home-auth-gate';

/**
 * The `(home)` group holds only the `/` route. The gate is the client backstop
 * that sends a signed-in visitor straight into the app when the middleware
 * could not settle a stale session cookie (KRTX-4736); every other marketing
 * route keeps the plain marketing layout.
 */
export default function HomeLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <HomeAuthGate>{children}</HomeAuthGate>;
}
