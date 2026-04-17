'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'

export default function Intro() {
  return (
    <section className="py-20 md:py-24 bg-pr-bg border-b border-white/[0.06]">
      <div className="site-container">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-center">
          {/* Copy */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <span className="section-label">Rescue Training &amp; Mountain Guiding</span>
            <h2 className="display-md mt-3 text-pr-text">
              Professional training for rescue, tactical, and mountain teams
            </h2>
            <p className="mt-5 text-pr-muted leading-relaxed">
              We provide each client with cutting edge skills and education to prevent catastrophe — customized for your team, terrain, and mission.
            </p>
            <Link
              href="/services"
              className="inline-block mt-7 text-sm font-display font-600 tracking-widest uppercase text-pr-red hover:text-pr-red-light transition-colors"
            >
              View All Training Programs →
            </Link>
          </motion.div>

          {/* Certifications / trust signals */}
          <motion.div
            className="grid grid-cols-2 gap-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            {[
              { src: '/images/certs/ifmga.png', alt: 'IFMGA', w: 100, h: 100 },
              { src: '/images/certs/amga.png', alt: 'AMGA', w: 100, h: 100 },
              { src: '/images/certs/itra.png', alt: 'ITRA', w: 140, h: 65 },
              { src: '/images/certs/ptp.png', alt: 'Petzl Technical Partner', w: 140, h: 68 },
            ].map((cert) => (
              <div
                key={cert.alt}
                className="flex items-center justify-center p-6 glass-card"
              >
                <div className="relative" style={{ width: cert.w, height: cert.h }}>
                  <Image
                    src={cert.src}
                    alt={cert.alt}
                    fill
                    className="object-contain"
                  />
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  )
}
