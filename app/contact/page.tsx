import type { Metadata } from 'next'

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
            <form className="flex flex-col gap-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-display font-600 tracking-widest uppercase text-pr-muted">
                    First Name
                  </label>
                  <input
                    type="text"
                    name="firstName"
                    required
                    className="bg-pr-surface border border-white/10 text-pr-text px-4 py-3 text-sm placeholder-pr-muted/50 focus:outline-none focus:border-pr-red/50 transition-colors"
                    placeholder="John"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-display font-600 tracking-widest uppercase text-pr-muted">
                    Last Name
                  </label>
                  <input
                    type="text"
                    name="lastName"
                    required
                    className="bg-pr-surface border border-white/10 text-pr-text px-4 py-3 text-sm placeholder-pr-muted/50 focus:outline-none focus:border-pr-red/50 transition-colors"
                    placeholder="Smith"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-display font-600 tracking-widest uppercase text-pr-muted">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  required
                  className="bg-pr-surface border border-white/10 text-pr-text px-4 py-3 text-sm placeholder-pr-muted/50 focus:outline-none focus:border-pr-red/50 transition-colors"
                  placeholder="you@organization.com"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-display font-600 tracking-widest uppercase text-pr-muted">
                  Organization / Team
                </label>
                <input
                  type="text"
                  name="organization"
                  className="bg-pr-surface border border-white/10 text-pr-text px-4 py-3 text-sm placeholder-pr-muted/50 focus:outline-none focus:border-pr-red/50 transition-colors"
                  placeholder="Company, unit, or agency name"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-display font-600 tracking-widest uppercase text-pr-muted">
                  Training Interest
                </label>
                <select
                  name="interest"
                  className="bg-pr-surface border border-white/10 text-pr-text px-4 py-3 text-sm focus:outline-none focus:border-pr-red/50 transition-colors appearance-none"
                >
                  <option value="">Select a program area</option>
                  <option value="tactical">Military &amp; Tactical</option>
                  <option value="sar">Backcountry &amp; SAR</option>
                  <option value="industrial">Industrial &amp; Facilities</option>
                  <option value="specialty">Specialty &amp; Commercial</option>
                  <option value="custom">Custom / Multiple Programs</option>
                  <option value="courses">Online Courses</option>
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-display font-600 tracking-widest uppercase text-pr-muted">
                  Message
                </label>
                <textarea
                  name="message"
                  rows={5}
                  required
                  className="bg-pr-surface border border-white/10 text-pr-text px-4 py-3 text-sm placeholder-pr-muted/50 focus:outline-none focus:border-pr-red/50 transition-colors resize-none"
                  placeholder="Tell us about your team, your training goals, and any relevant timeline or location details."
                />
              </div>

              <button
                type="submit"
                className="px-8 py-4 bg-pr-red text-white font-display font-700 text-sm tracking-widest uppercase hover:bg-pr-red-light transition-colors self-start"
              >
                Send Message
              </button>
            </form>
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

              <div className="glass-card p-6 mt-4">
                <p className="text-xs text-pr-muted font-display tracking-widest uppercase mb-3">Response Time</p>
                <p className="text-sm text-pr-muted leading-relaxed">
                  We typically respond within one business day. For urgent training needs or
                  existing course inquiries, calling is fastest.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
