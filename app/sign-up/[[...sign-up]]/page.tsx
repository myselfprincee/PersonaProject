// app/sign-up/[[...sign-up]]/page.tsx
import { SignUp } from '@clerk/nextjs'

import { clerkAppearance } from '@/clerk/appearance'

export default function SignUpPage() {
  return (
    <div className="flex items-center justify-center min-h-screen"
    style={{
        backgroundImage:
          'url(https://res.cloudinary.com/princeecloud/image/upload/v1782141394/sign_after_landing_gerae3.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        backgroundBlendMode: 'darken',
        backdropFilter: 'blur(8px)',
      }}>
      <SignUp appearance={clerkAppearance}  redirectUrl="/" />
    </div>
  )
}