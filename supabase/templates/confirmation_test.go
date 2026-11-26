package confirmation

import (
	"bytes"
	"html/template"
	"net/url"
	"os"
	"strings"
	"testing"
)

func TestConfirmation(t *testing.T) {
	source, err := os.ReadFile("confirmation.html")
	if err != nil {
		t.Fatal(err)
	}
	tpl, err := template.New("confirmation").Parse(string(source))
	if err != nil {
		t.Fatal(err)
	}
	for _, target := range []string{"kortix://auth/callback?state=native-state", "https://app.example.test/auth/callback", "https://app.example.test/auth/callback?returnUrl=%2Fworkspaces&terms_accepted=true"} {
		t.Run(target, func(t *testing.T) {
			confirmation := "https://auth.example.test/verify?token=synthetic&type=signup"
			var b bytes.Buffer
			err := tpl.Execute(&b, map[string]string{"RedirectTo": target, "TokenHash": "synthetic-hash", "ConfirmationURL": confirmation, "SiteURL": "https://app.example.test"})
			if err != nil {
				t.Fatal(err)
			}
			html := b.String()
			start := strings.Index(html, `href="`) + 6
			end := strings.Index(html[start:], `"`) + start
			link := strings.ReplaceAll(html[start:end], "&amp;", "&")
			if strings.HasPrefix(target, "kortix:") {
				if link != confirmation {
					t.Fatalf("native link = %s", link)
				}
				return
			}
			u, err := url.Parse(link)
			if err != nil {
				t.Fatal(err)
			}
			if u.Path != "/auth/confirm" || u.Query().Get("token_hash") != "synthetic-hash" || u.Query().Get("redirect_to") != target {
				t.Fatalf("callback = %s", link)
			}
		})
	}
}
