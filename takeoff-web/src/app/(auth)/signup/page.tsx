import { SignupForm } from '@/components/auth/SignupForm';

export default function SignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-lg bg-white p-8 shadow-md">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-gray-900">Takeoff</h1>
            <p className="mt-1 text-sm text-gray-500">
              Create your account
            </p>
          </div>
          <SignupForm />
        </div>
      </div>
    </div>
  );
}
