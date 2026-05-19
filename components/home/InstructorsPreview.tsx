'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'
import { instructors, roleLabels } from '@/lib/data/instructors'

// Show just the lead instructors on homepage
const featured = instructors.filter((i) => i.role === 'lead')

export default function InstructorsPreview() {
  return (
    <section className="py-24 md:py-32 bg-pr-bg overflow-hidden">
      <div className="site-container">
        <motion.div
          className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <div>
            <span className="section-label">The Team</span>
            <h2 className="display-lg mt-3 text-pr-text">
              Led by the<br />
              <span className="text-pr-red">people in the field.</span>
            </h2>
          </div>
          <Link
            href="/team"
            className="shrink-0 text-sm font-display font-600 tracking-widest uppercase text-pr-red hover:text-pr-red-light transition-colors"
          >
            All 16 Instructors →
          </Link>
        </motion.div>

        {/* Horizontal scroll on mobile, grid on desktop */}
        <div className="flex md:grid md:grid-cols-4 gap-4 overflow-x-auto pb-4 md:pb-0 -mx-6 px-6 md:mx-0 md:px-0 snap-x snap-mandatory md:snap-none">
          {featured.map((instructor, i) => (
            <motion.div
              key={instructor.slug}
              className="flex-shrink-0 w-60 md:w-auto snap-start"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.07 }}
            >
              <Link href={`/team/${instructor.slug}`} className="group flex flex-col">
                {/* Photo */}
                <div className="relative aspect-[3/4] bg-pr-surface overflow-hidden mb-4">
                  {instructor.avatar ? (
                    <Image
                      src={instructor.avatar}
                      alt={instructor.name}
                      fill
                      className="object-cover object-top grayscale group-hover:grayscale-0 transition-all duration-500"
                      sizes="(max-width: 768px) 240px, 25vw"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="font-display font-700 text-5xl text-pr-muted/20 tracking-widest">
                        {instructor.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                      </span>
                    </div>
                  )}
                  {/* Red bottom line on hover */}
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-pr-red scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
                </div>

                <h3 className="font-display font-700 text-lg tracking-wide uppercase text-pr-text group-hover:text-pr-red transition-colors">
                  {instructor.name}
                </h3>
                <p className="text-[11px] text-pr-muted mt-1 font-display tracking-widest uppercase leading-tight">
                  {roleLabels[instructor.role]}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {instructor.certifications.slice(0, 2).map((cert) => (
                    <span
                      key={cert}
                      className="px-1.5 py-0.5 text-[9px] font-display tracking-widest uppercase border border-white/10 text-pr-muted"
                    >
                      {cert}
                    </span>
                  ))}
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
