subject: {cfg:site_name}: Download receipt

{alternative:plain}

Dear Sir or Madam,

{if:files>1}Several files{else}A file{endif} you uploaded {if:files>1}have{else}has{endif} been downloaded from {cfg:site_name} by {user.email} :

{if:files>1}{each:files as file}
  - {file.name} ({size:file.size})
{endeach}{else}
{files.first().name} ({size:files.first().size})
{endif}

You can access your files and view detailed download statistics on the transfers page at {cfg:site_url}?s=transfers.

Best regards,
{cfg:site_name}

{alternative:html}

<p>
    Dear Sir or Madam,
</p>

<p>
    {if:files>1}Several files{else}A file{endif} you uploaded {if:files>1}have{else}has{endif} been downloaded from {cfg:site_name} by {user.email}.
</p>

<p>
    {if:files>1}
    <ul>
        {each:files as file}
            <li>{file.name} ({size:file.size})</li>
        {endeach}
    </ul>
    {else}
    {files.first().name} ({size:files.first().size})
    {endif}
</p>

<p>
    You can access your files and view detailed download statistics on the transfers page at {cfg:site_url}?s=transfers.
</p>

<p>
    Best regards,<br />
    {cfg:site_name}
</p>