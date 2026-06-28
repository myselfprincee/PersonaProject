export const clerkAppearance = {
  baseTheme: "light" as const,
  variables: {
    colorPrimary: "#6c47ff",
    colorText: "#111827",
    colorTextSecondary: "#6b7280",
    colorBackground: "#ffffff",
    colorInputBackground: "#f9fafb",
    colorInputText: "#111827",
    colorDanger: "#dc2626",
    fontFamily:
      'var(--font-geist-sans), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: "14px",
    borderRadius: "10px",
  },
  elements: {
    card: "bg-white shadow-xl border border-gray-200",
    headerTitle:
      "font-semibold tracking-tight text-3xl text-center text-gray-900",
    headerSubtitle: "text-sm text-gray-600",
    formFieldLabel: "font-medium text-gray-700",
    formFieldInput:
      "bg-gray-50 border border-gray-300 rounded-xl text-gray-900",
    formButtonPrimary:
      "bg-[#6c47ff] hover:bg-[#5a3dd1] text-white rounded-xl font-medium transition-all",
    socialButtonsBlockButton:
      "border border-gray-200 hover:border-[#6c47ff] hover:bg-[#6c47ff]/5 rounded-xl font-medium",
    dividerLine: "bg-gray-200",
    dividerText:
      "text-xs font-medium uppercase tracking-[0.18em] text-gray-500",
    footerActionLink: "font-medium text-[#6c47ff] hover:text-[#5a3dd1]",
    identityPreviewText: "font-medium text-gray-900",
    formFieldHintText: "text-xs text-gray-500",
    formFieldErrorText: "text-sm text-red-600",
  },
};
