import Link from 'next/link'
import Image from 'next/image'
import { posts } from '@/lib/data/posts'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Insights on rescue training, mountain guiding, and field operations from the Peak Rescue team.',
}

export default function BlogPage() {
  return (
    <>
      <div className="pt-32 pb-16 bg-pr-surface border-b border-white/[0.06]">
        <div className="site-container">
          <span className="section-label">Field Notes</span>
          <h1 className="display-lg mt-3 text-pr-text">Blog</h1>
          <p className="mt-4 text-pr-muted max-w-xl leading-relaxed">
            Perspectives from instructors who spend more time in the field than behind a desk.
          </p>
        </div>
      </div>

      <div className="py-20 bg-pr-bg">
        <div className="site-container">
          <div className="flex flex-col divide-y divide-white/[0.06]">
            {posts.map((post) => (
              <article key={post.slug} className="group py-10 first:pt-0">
                <Link href={`/blog/${post.slug}`} className="flex gap-8 items-start">
                  {post.image && (
                    <div className="relative flex-shrink-0 w-40 h-28 overflow-hidden hidden sm:block">
                      <Image
                        src={post.image}
                        alt={post.title}
                        fill
                        className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
                        sizes="160px"
                      />
                    </div>
                  )}
                  <div className="flex-1">
                    <time className="section-label text-[10px]">{post.date}</time>
                    <h2 className="display-md mt-3 text-pr-text group-hover:text-pr-red transition-colors">
                      {post.title}
                    </h2>
                    <p className="mt-4 text-pr-muted max-w-2xl leading-relaxed">{post.excerpt}</p>
                    <span className="inline-block mt-4 text-sm font-display font-600 tracking-widest uppercase text-pr-red">
                      Read More →
                    </span>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
