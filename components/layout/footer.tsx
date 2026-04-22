export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t bg-background px-6 py-4">
      <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
        <p>© {year} GDG-AAMU. All rights reserved.</p>

        <div className="flex items-center gap-5">
          <a
            href="mailto:sagyire83@gmail.com"
            className="hover:text-foreground transition-colors"
          >
            Contact
          </a>
          <a
            href="https://gdg.community.dev/gdg-on-campus-alabama-agricultural-and-mechanical-university-normal-united-states/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#8B0000] font-medium transition-colors"
          >
            Join GDG on Campus AAMU →
          </a>
        </div>
      </div>
    </footer>
  )
}
