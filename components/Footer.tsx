import Link from 'next/link'
import Image from 'next/image'
import { categoryMeta } from '@/lib/data/services'

const serviceLinks = Object.entries(categoryMeta).map(([key, val]) => ({
  href: `/services#${key}`,
  label: val.label,
}))

const companyLinks = [
  { href: '/team', label: 'Our Team' },
  { href: '/courses', label: 'Courses' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/blog', label: 'Blog' },
  { href: '/contact', label: 'Contact' },
]

export default function Footer() {
  return (
    <footer className="bg-pr-surface border-t border-white/[0.06] mt-auto">
      <div className="site-container py-16 md:py-20">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 md:gap-8">
          {/* Brand */}
          <div className="md:col-span-1">
            <div className="mb-6">
              <Image
                src="/logo.png"
                alt="Peak Rescue"
                width={160}
                height={52}
                className="object-contain"
                style={{ filter: 'invert(1)' }}
              />
            </div>
            <div className="flex flex-col gap-1 text-sm text-pr-muted">
              <a href="tel:+18337372834" className="hover:text-pr-text transition-colors">
                (833) 737-2834
              </a>
              <a
                href="mailto:info@peak-rescue.com"
                className="hover:text-pr-text transition-colors"
              >
                info@peak-rescue.com
              </a>
              <span>Casper, Wyoming</span>
            </div>
          </div>

          {/* Training */}
          <div>
            <h3 className="section-label mb-5">Training Programs</h3>
            <ul className="flex flex-col gap-2">
              {serviceLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-pr-muted hover:text-pr-text transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/services"
                  className="text-sm text-pr-red hover:text-pr-red-light transition-colors"
                >
                  All Programs →
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="section-label mb-5">Company</h3>
            <ul className="flex flex-col gap-2">
              {companyLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-pr-muted hover:text-pr-text transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* CTA */}
          <div>
            <h3 className="section-label mb-5">Ready to Train?</h3>
            <p className="text-sm text-pr-muted leading-relaxed mb-6">
              Every program is customizable for your team size, environment, and mission profile.
            </p>
            <Link
              href="/contact"
              className="inline-block px-6 py-3 bg-pr-red text-white text-sm font-display font-700 tracking-widest uppercase hover:bg-pr-red-light transition-colors"
            >
              Get in Touch
            </Link>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-16 pt-8 border-t border-white/[0.05] text-xs text-pr-muted">
          <span>© {new Date().getFullYear()} Peak Rescue. All rights reserved.</span>
        </div>
      </div>
    </footer>
  )
}
