<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Peer review lives in submissions/submission_links/votes/comments tables; publishing happens in the DB function publish_if_approved so guests and clients never write graph tables directly. Why: keeps graph writes atomic and RLS-safe without a service key.
- Every graph/submission table has a log_change trigger writing change_log, attributed to profiles. Why: global accountable history, including manual data edits.
- University status is computed by is_academic() from the confirmed email domain, never stored on a user-editable row. Why: prevents self-granted reviewer rights.
