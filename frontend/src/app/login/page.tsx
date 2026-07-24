import { LoginForm } from "@/components/auth/LoginForm";
import Link from "next/link";

export default function LoginPage() {
  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center p-4 md:p-6 overflow-x-hidden bg-gradient-to-br from-[#D8E7F8] via-[#63A8FF] to-[#7B74FF]">
      {/* Background radial soft light-glows */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-[#D8E7F8]/50 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] rounded-full bg-[#7B74FF]/30 blur-[120px] pointer-events-none" />

      {/* Top Left Navigation Link */}
      <div className="absolute top-6 left-6 md:top-8 md:left-10 z-10">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-white font-semibold text-xs md:text-sm tracking-wide opacity-90 hover:opacity-100 transition-opacity"
        >
          <span className="text-sm font-bold">&lt;</span>
          <span>Home page</span>
        </Link>
      </div>

      <div className="w-full flex flex-col items-center z-10">
        {/* Logo: Centered above card */}
        <div className="flex items-center gap-2.5 mb-6 text-white select-none">
          <svg
            className="w-6 h-6 text-white"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {/* Flower/geometric star icon resembling reference */}
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2a3.5 3.5 0 0 1 3.5 3.5v1.5a3.5 3.5 0 0 1-7 0v-1.5A3.5 3.5 0 0 1 12 2z" />
            <path d="M12 22a3.5 3.5 0 0 1-3.5-3.5v-1.5a3.5 3.5 0 0 1 7 0v1.5A3.5 3.5 0 0 1 12 22z" />
            <path d="M2 12a3.5 3.5 0 0 1 3.5-3.5h1.5a3.5 3.5 0 0 1 0 7H5.5A3.5 3.5 0 0 1 2 12z" />
            <path d="M22 12a3.5 3.5 0 0 1-3.5 3.5h-1.5a3.5 3.5 0 0 1 0-7h1.5A3.5 3.5 0 0 1 22 12z" />
          </svg>
          <span className="text-[17px] font-black tracking-[0.2em] text-white">SMART DOCS</span>
        </div>

        {/* LoginForm Card */}
        <LoginForm />
      </div>
    </div>
  );
}
