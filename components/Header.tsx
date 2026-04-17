'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'

const navLinks = [
  { href: '/services', label: 'Training' },
  { href: '/instructors', label: 'Team' },
  { href: '/courses', label: 'Courses' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/blog', label: 'Blog' },
  { href: '/contact', label: 'Contact' },
]

export default function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled || menuOpen
            ? 'bg-pr-bg/95 backdrop-blur-md border-b border-white/[0.06]'
            : 'bg-transparent'
        }`}
      >
        <div className="site-container flex items-center justify-between h-16 md:h-20">
          {/* Logo mark only — clip the text rows below the triangles */}
          <Link href="/" aria-label="Peak Rescue home" className="flex items-center">
            <div className="relative overflow-hidden" style={{ width: 140, height: 63 }}>
              <Image
                src="/logo.png"
                alt="Peak Rescue"
                fill
                className="object-cover object-top"
                style={{ filter: 'invert(1)' }}
                priority
              />
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const active = pathname === link.href || pathname.startsWith(link.href + '/')
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-4 py-2 text-sm font-display font-600 tracking-widest uppercase transition-colors ${
                    active ? 'text-pr-red' : 'text-pr-muted hover:text-pr-text'
                  }`}
                >
                  {link.label}
                </Link>
              )
            })}
            <Link
              href="/contact"
              className="ml-4 px-5 py-2 bg-pr-red text-white text-sm font-display font-700 tracking-widest uppercase hover:bg-pr-red-light transition-colors"
            >
              Get Training
            </Link>
          </nav>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 text-pr-muted hover:text-pr-text transition-colors"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            <div className="w-6 flex flex-col gap-1.5">
              <span
                className={`block h-px bg-current transition-all origin-center ${
                  menuOpen ? 'rotate-45 translate-y-2' : ''
                }`}
              />
              <span
                className={`block h-px bg-current transition-all ${
                  menuOpen ? 'opacity-0 scale-x-0' : ''
                }`}
              />
              <span
                className={`block h-px bg-current transition-all origin-center ${
                  menuOpen ? '-rotate-45 -translate-y-2' : ''
                }`}
              />
            </div>
          </button>
        </div>
      </header>

      {/* Mobile menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="fixed top-16 left-0 right-0 z-40 bg-pr-bg/98 backdrop-blur-md border-b border-white/[0.06] md:hidden"
          >
            <nav className="site-container py-6 flex flex-col gap-1">
              {navLinks.map((link) => {
                const active = pathname === link.href || pathname.startsWith(link.href + '/')
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`py-3 text-lg font-display font-600 tracking-widest uppercase border-b border-white/[0.04] transition-colors ${
                      active ? 'text-pr-red' : 'text-pr-text hover:text-pr-red'
                    }`}
                  >
                    {link.label}
                  </Link>
                )
              })}
              <Link
                href="/contact"
                className="mt-4 py-3 text-center bg-pr-red text-white text-lg font-display font-700 tracking-widest uppercase"
              >
                Get Training
              </Link>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
