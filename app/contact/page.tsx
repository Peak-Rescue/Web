import type { Metadata } from 'next'
import ContactForm from './ContactForm'

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with Peak Rescue to build a custom training program for your team.',
}

export default function ContactPage() {
  return (
    <>
      {/* Page hero */}
      <div className="pt-32 pb-16 bg-pr-surface border-b border-white/[0.06] relative overflow-hidden">
        <div className="absolute top-0 left-0 w-48 h-1 bg-pr-red" />
        <div className="site-container">
          <span className="section-label">Reach Out</span>
          <h1 className="display-lg mt-3 text-pr-text">Contact Us</h1>
          <p className="mt-4 text-pr-muted max-w-xl leading-relaxed">
            Every program starts with a conversation. Tell us about your team and what you need —
            we&apos;ll put together the right training.
          </p>
        </div>
      </div>

      <div className="py-20 bg-pr-bg">
        <div className="site-container grid grid-cols-1 lg:grid-cols-5 gap-16">
          {/* Contact form */}
          <div className="lg:col-span-3">
            <h2 className="section-label mb-8">Send a Message</h2>
            <ContactForm />
          </div>

          {/* Contact info sidebar */}
          <div className="lg:col-span-2">
            <h2 className="section-label mb-8">Direct Contact</h2>

            <div className="flex flex-col gap-8">
              <div>
                <p className="text-xs text-pr-muted font-display tracking-widest uppercase mb-2">Phone</p>
                <a
                  href="tel:+18337372834"
                  className="text-xl font-display font-600 text-pr-text hover:text-pr-red transition-colors tracking-wide"
                >
                  (833) 737-2834
                </a>
              </div>

              <div>
                <p className="text-xs text-pr-muted font-display tracking-widest uppercase mb-2">Email</p>
                <a
                  href="mailto:info@peak-rescue.com"
                  className="text-xl font-display font-600 text-pr-text hover:text-pr-red transition-colors tracking-wide"
                >
                  info@peak-rescue.com
                </a>
              </div>

              <div>
                <p className="text-xs text-pr-muted font-display tracking-widest uppercase mb-2">Based In</p>
                <p className="text-xl font-display font-600 text-pr-text tracking-wide">
                  Casper, Wyoming
                </p>
                <p className="text-sm text-pr-muted mt-1">
                  Training delivered nationwide and internationally.
                </p>
              </div>

            </div>
          </div>
        </div>
      </div>
    </>
  )
}
