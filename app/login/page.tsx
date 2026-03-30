export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm space-y-6 text-center">
        <h1 className="text-2xl font-bold">Elion Outreach</h1>
        <p className="text-gray-600">Sign in to manage your outreach campaigns</p>
        <a
          href="/api/auth/login"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-white font-medium hover:bg-blue-700"
        >
          Sign in with Google
        </a>
      </div>
    </div>
  );
}
