import { BoilClock } from './animation/boilClock';
import { ABM_NEWSLETTER_POSTS, parseAbmLetter, renderAbmLetter } from './app/abmNewsletterModal';

const index = document.querySelector<HTMLElement>('#post-index');
const posts = document.querySelector<HTMLElement>('#posts');
if (!index || !posts) throw new Error('Missing patch notes page elements.');

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const clock = new BoilClock(document, !reducedMotion.matches);
reducedMotion.addEventListener('change', () => clock.setEnabled(!reducedMotion.matches));

for (const post of ABM_NEWSLETTER_POSTS) {
  const blocks = parseAbmLetter(post.source, post.visuals);
  const heading = blocks.find((block) => block.type === 'heading' && block.level === 1);
  if (!heading || heading.type !== 'heading') throw new Error(`Newsletter post ${post.id} needs a title.`);

  const link = document.createElement('a');
  link.href = `#${post.id}`;
  link.textContent = heading.text;
  index.append(link);

  const { element } = renderAbmLetter(clock, post);
  element.id = post.id;
  element.classList.add('patch-notes-post');
  element.querySelector('h1')?.classList.add('patch-notes-post__title');
  posts.append(element);
}
