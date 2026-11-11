'use client';

import Image from 'next/image';
import Link from 'next/link';

import { KortixAsterisk } from '@kortix/ui/kortix-asterisk';
import { PostMeta } from '@/components/blog/post-card';
import { type Post } from '@/lib/blog';
import { cn } from '@kortix/ui';
import { USE_CASE_COVERS } from './covers';

/**
 * Cover art with three tiers, most specific first:
 *  1. a custom per-slug cover component (USE_CASE_COVERS) — put anything here;
 *  2. the frontmatter `cover` image;
 *  3. a plain muted tile with the asterisk.
 */
export function UseCaseCover({
  post,
  featured,
  className,
}: {
  post: Post;
  featured?: boolean;
  className?: string;
}) {
  const Custom = USE_CASE_COVERS[post.slug];
  if (Custom) {
    return (
      <div className={cn('bg-muted border-border relative overflow-hidden border', className)}>
        <Custom post={post} featured={featured} />
      </div>
    );
  }
  if (post.data.cover) {
    return (
      <div className={cn('bg-muted border-border relative overflow-hidden border', className)}>
        <Image
          src={post.data.cover}
          alt={post.data.title}
          fill
          className="object-cover"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        />
      </div>
    );
  }
  return (
    <div className={cn('bg-muted border-border relative flex items-center justify-center border', className)}>
      <KortixAsterisk index={0} parentClass="size-10" />
    </div>
  );
}

/**
 * The lead use case (Polar blog lead, as on /blog): the two-tone title on the
 * left, the title in ink and the description under it in muted ink at the
 * same size, the cover on the right. The whole block is one link.
 */
export function UseCaseFeatured({ post }: { post: Post }) {
  return (
    <Link
      href={post.url}
      className="outline-ring grid grid-cols-1 items-center gap-10 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 lg:grid-cols-2 lg:gap-16"
    >
      <div className="order-last lg:order-first">
        <h2 className="text-xl font-medium tracking-tight text-balance md:text-2xl">
          <span className="text-foreground">{post.data.title}</span>
          {post.data.description ? (
            <>
              {' '}
              <span className="text-muted-foreground mt-2 block line-clamp-3">{post.data.description}</span>
            </>
          ) : null}
        </h2>
        <PostMeta post={post} className="mt-8" />
      </div>
      <UseCaseCover post={post} featured className="aspect-video w-full" />
    </Link>
  );
}
