'use client'

import Image from 'next/image'

export default function Hero() {
  return (
    <section className="relative w-full bg-pr-bg pt-16 md:pt-20">
      <div className="relative w-full" style={{ aspectRatio: '1509 / 760' }}>
        <Image
          src="/images/pr_hero.jpeg"
          alt="Peak Rescue — mountain rescue and tactical operations"
          fill
          priority
          className="object-contain"
          sizes="100vw"
        />
        {/* Bottom scrim to blend into next section */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-pr-bg to-transparent" />
      </div>
    </section>
  )
}
