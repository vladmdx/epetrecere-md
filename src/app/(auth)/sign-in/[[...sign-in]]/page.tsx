import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <SignIn forceRedirectUrl="/auth-redirect"
        appearance={{
          elements: {
            formButtonPrimary:
              "bg-[#C9A84C] hover:bg-[#A08839] text-[#0D0D0D]",
            card: "bg-card border border-border/40",
            headerTitle: "text-foreground",
            headerSubtitle: "text-muted-foreground",
            socialButtonsBlockButton:
              "border-border/40 text-foreground hover:bg-accent",
            formFieldLabel: "text-foreground",
            formFieldInput: "bg-background border-border/40 text-foreground",
            footerActionLink: "text-[#C9A84C] hover:text-[#A08839]",
          },
        }}
      />
    </div>
  );
}
