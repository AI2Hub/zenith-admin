/** The sandbox has an opaque origin; both ends authenticate messages by window identity and a per-document nonce. */
export function cmsPreviewDocument(html: string, nonce: string): string {
  const token = JSON.stringify(nonce).replaceAll('<', '\\u003c');
  const policy = `default-src 'none'; img-src http: https: data: blob:; media-src http: https: blob:; font-src http: https: data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'none'; form-action 'none'; base-uri 'none'`;
  const script = `<script nonce="${nonce}">(function(){
    var nonce=${token},locate=false,selected=null,raf=0;
    function send(type,extra){parent.postMessage(Object.assign({type:type,nonce:nonce},extra||{}),'*')}
    function anchor(key){var n=key&&element(key);return n&&(n.getBoundingClientRect().height?n:n.firstElementChild)}
    function position(){var n=anchor(selected);send('cms-preview-position',{x:scrollX,y:scrollY,selectedKey:selected,anchorOffset:n?n.getBoundingClientRect().top:null})}
    function element(key){return Array.from(document.querySelectorAll('[data-cms-preview-edit]')).find(function(n){return n.getAttribute('data-cms-preview-edit')===key})}
    function select(key){document.querySelectorAll('.cms-preview-selected').forEach(function(n){n.classList.remove('cms-preview-selected')});selected=key;var n=key&&element(key);if(n)n.classList.add('cms-preview-selected')}
    function editing(value){locate=!!value;document.documentElement.classList.toggle('cms-preview-locate',locate)}
    addEventListener('message',function(e){if(e.source!==parent||!e.data||e.data.nonce!==nonce)return;
      if(e.data.type==='cms-preview-edit-mode')editing(e.data.enabled);
      if(e.data.type==='cms-preview-init'){editing(e.data.enabled);var p=e.data.position||{};select(p.selectedKey||null);requestAnimationFrame(function(){var n=anchor(selected);if(n&&typeof p.anchorOffset==='number')scrollTo(Number(p.x)||0,n.getBoundingClientRect().top+scrollY-p.anchorOffset);else scrollTo(Number(p.x)||0,Number(p.y)||0);position()})}
    });
    addEventListener('scroll',function(){if(!raf)raf=requestAnimationFrame(function(){raf=0;position()})},{passive:true});
    document.addEventListener('click',function(e){var node=e.target.closest&&e.target.closest('[data-cms-preview-edit]');
      if(locate&&node){e.preventDefault();e.stopPropagation();select(node.getAttribute('data-cms-preview-edit'));position();send('cms-preview-edit',{key:selected});return}
      var a=e.target.closest&&e.target.closest('a[data-cms-preview-path]');if(a){e.preventDefault();position();send('cms-preview-navigation',{path:a.getAttribute('data-cms-preview-path')})}
    },true);
    document.addEventListener('submit',function(e){e.preventDefault()});
  })();</script>`;
  const style = '<style>.cms-preview-locate [data-cms-preview-edit]{cursor:crosshair!important}.cms-preview-locate [data-cms-preview-edit]:hover,.cms-preview-selected{outline:2px solid #00a67d!important;outline-offset:3px}.cms-preview-locate [data-cms-page-block]:hover>*,[data-cms-page-block].cms-preview-selected>*{outline:2px solid #00a67d;outline-offset:3px}</style>';
  return html.replace(/<head([^>]*)>/i, `<head$1><meta http-equiv="Content-Security-Policy" content="${policy}">${style}`).replace('</body>', `${script}</body>`);
}

export type CmsPreviewPosition = { x: number; y: number; selectedKey: string | null; anchorOffset: number | null };
export function readCmsPreviewPosition(value: Record<string, unknown>): CmsPreviewPosition | null {
  if (typeof value.x !== 'number' || typeof value.y !== 'number' || !Number.isFinite(value.x) || !Number.isFinite(value.y) || value.x < 0 || value.y < 0 || value.x > 1e7 || value.y > 1e7) return null;
  if (value.selectedKey !== null && (typeof value.selectedKey !== 'string' || value.selectedKey.length > 200)) return null;
  if (value.anchorOffset !== null && (typeof value.anchorOffset !== 'number' || !Number.isFinite(value.anchorOffset) || Math.abs(value.anchorOffset) > 1e7)) return null;
  return { x: value.x, y: value.y, selectedKey: value.selectedKey, anchorOffset: value.anchorOffset };
}

/** Session-only editor positions survive moving between CMS editors. No HTML or tokens are cached. */
export const cmsPreviewPositions = new Map<string, CmsPreviewPosition>();
