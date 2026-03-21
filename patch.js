const fs = require('fs');
let content = fs.readFileSync('src/app/marketplace/page.tsx', 'utf8');

content = content.replace(
  /<article key=\{item\.txId\} className="cyber-card product-card">/g,
  '<article key={item.txId} className="cyber-card product-card" style={{ cursor: "pointer" }} onClick={() => setSelectedItem(item)}>'
);

content = content.replace(
  /<p>\{item\.seller\}<\/p>\s*<p>\{item\.description\}<\/p>/g,
  '<p className="code-tag truncate-1">{shortAddress(item.seller)}</p>\n                <p className="truncate-1">{item.description}</p>'
);

content = content.replace(
  /href=\{`https:\/\/testnet\.explorer\.perawallet\.app\/tx\/\$\{item\.txId\}`\}/g,
  'onClick={(e) => e.stopPropagation()}\n                    href={`https://testnet.explorer.perawallet.app/tx/${item.txId}`}'
);

content = content.replace(
  /<\/section>\s*<\/DashboardShell>/,
  `</section>

        {selectedItem && (
          <div className="modal-overlay" onClick={() => setSelectedItem(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="modal-close" onClick={() => setSelectedItem(null)}>
                &times;
              </button>
              <h3>{selectedItem.service}</h3>
              <div className="product-top" style={{ justifyContent: "flex-start", gap: "1rem", marginTop: 0, marginBottom: "0.5rem" }}>
                <span>{selectedItem.type}</span>
                <span>{formatReputation(reputationByAgent[selectedItem.seller])}</span>
              </div>
              <p className="code-tag" style={{ wordBreak: "break-all" }}>
                Seller: {selectedItem.seller}
              </p>
              <div style={{ maxHeight: "40vh", overflowY: "auto", paddingRight: "0.5rem" }}>
                <p>
                  <strong style={{ color: "var(--accent)" }}>Description:</strong>
                  <br />
                  {selectedItem.description}
                </p>
              </div>
              <p>
                <strong style={{ color: "var(--accent)" }}>Price:</strong> {selectedItem.price} ALGO
              </p>
              <div style={{ marginTop: "0.5rem" }}>
                <a
                  className="btn-outline"
                  target="_blank"
                  rel="noreferrer"
                  href={\`https://testnet.explorer.perawallet.app/tx/\${selectedItem.txId}\`}
                  style={{ display: "inline-block" }}
                >
                  View on Explorer
                </a>
              </div>
            </div>
          </div>
        )}
      </DashboardShell>`
);

fs.writeFileSync('src/app/marketplace/page.tsx', content);
