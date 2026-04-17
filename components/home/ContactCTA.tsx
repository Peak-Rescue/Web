'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'

export default function ContactCTA() {
  return (
    <section className="relative py-24 md:py-32 bg-pr-surface overflow-hidden">
      {/* Background grid texture */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, #fff 0px, #fff 1px, transparent 1px, transparent 60px), repeating-linear-gradient(90deg, #fff 0px, #fff 1px, transparent 1px, transparent 60px)',
        }}
      />

      {/* Red accent corner */}
      <div className="absolute top-0 left-0 w-32 h-1 bg-pr-red" />
      <div className="absolute top-0 left-0 w-1 h-32 bg-pr-red" />

      <div className="relative z-10 site-container">
        <div className="max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <span className="section-label">Custom Training</span>
            <h2 className="display-lg mt-3 text-pr-text">
              Don&apos;t see exactly<br />
              <span className="text-pr-red">what you need?</span>
            </h2>
            <p className="mt-6 text-pr-muted text-lg leading-relaxed max-w-xl">
              Every program we run is designed around your team's mission profile, current
              capabilities, and operating environment. We don't teach generic courses — we build
              the right training.
            </p>
          </motion.div>

          <motion.div
            className="mt-10 flex flex-wrap gap-6"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            <Link
              href="/contact"
              className="px-8 py-4 bg-pr-red text-white font-display font-700 text-sm tracking-widest uppercase hover:bg-pr-red-light transition-colors"
            >
              Get in Touch
            </Link>
            <Link
              href="/services"
              className="px-8 py-4 border border-white/15 text-pr-text font-display font-700 text-sm tracking-widest uppercase hover:border-white/30 transition-colors"
            >
              Browse Programs
            </Link>
          </motion.div>

        </div>
      </div>
    </section>
  )
}
