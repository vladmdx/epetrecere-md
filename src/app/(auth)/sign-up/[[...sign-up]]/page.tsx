import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0D0D0D]">
      <SignUp forceRedirectUrl="/auth-redirect"
        appearance={{
          elements: {
            formButtonPrimary:
              "bg-[#C9A84C] hover:bg-[#A08839] text-[#0D0D0D] font-semibold",
            card: "bg-[#1A1A2E] border border-[#2A2A3E] shadow-xl",
            headerTitle: "text-[#FAF8F2]",
            headerSubtitle: "text-[#B0B0C0]",
            socialButtonsBlockButton:
              "border-[#2A2A3E] text-[#FAF8F2] bg-[#141428] hover:bg-[#1E1E38]",
            socialButtonsBlockButtonText: "text-[#FAF8F2]",
            formFieldLabel: "text-[#FAF8F2]",
            formFieldInput: "bg-[#141428] border-[#2A2A3E] text-[#FAF8F2]",
            footerActionLink: "text-[#C9A84C] hover:text-[#A08839]",
            footer: "text-[#B0B0C0]",
            footerActionText: "text-[#B0B0C0]",
            dividerLine: "bg-[#2A2A3E]",
            dividerText: "text-[#B0B0C0]",
            identityPreviewEditButton: "text-[#C9A84C]",
            formFieldInputShowPasswordButton: "text-[#B0B0C0]",
          },
        }}
      />
    </div>
  );
}
