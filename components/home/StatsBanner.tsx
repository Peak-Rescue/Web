'use client'

import { motion } from 'framer-motion'
import { services, categoryMeta } from '@/lib/data/services'
import { instructors } from '@/lib/data/instructors'

const stats = [
  { value: String(instructors.length), label: 'Certified Instructors' },
  { value: String(services.length) + '+', label: 'Training Programs' },
  { value: '20+', label: 'Years Experience' },
  { value: String(Object.keys(categoryMeta).length), label: 'Terrain Environments' },
]

export default function StatsBanner() {
  return (
    <section className="bg-pr-surface border-y border-white/[0.06] py-12 md:py-16">
      <div className="site-container">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              className="flex flex-col items-center text-center"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
            >
              <span className="font-display font-700 text-5xl md:text-6xl text-pr-red leading-none">
                {stat.value}
              </span>
              <span className="mt-2 text-xs text-pr-muted font-display tracking-widest uppercase">
                {stat.label}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
