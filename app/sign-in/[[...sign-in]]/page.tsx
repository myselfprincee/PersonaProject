'use client'
import { SignIn } from '@clerk/nextjs'

import { clerkAppearance } from '@/clerk/appearance'

export default function SignInPage() {
  return (
    <div
      className="flex items-center justify-center min-h-screen"
      style={{
        backgroundImage:
          'url(https://res.cloudinary.com/princeecloud/image/upload/v1782141394/sign_after_landing_gerae3.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        backgroundBlendMode: 'darken',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div className="w-full max-w-md mx-auto p-4">
        <SignIn appearance={clerkAppearance} redirectUrl="/" />
      </div>
    </div>
  )
}