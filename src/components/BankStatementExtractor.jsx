import React, { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

// Set up the worker for pdf.js
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

function BankStatementExtractor() {
    // State variables
    const [file, setFile] = useState(null);
    const [numPages, setNumPages] = useState(null);
    const [extractedData, setExtractedData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [pageText, setPageText] = useState([]);

    // Handle file upload
    const handleFileChange = (event) => {
        const selectedFile = event.target.files[0];
        if (selectedFile && selectedFile.type === 'application/pdf') {
            setFile(selectedFile);
            setPageText([]);
            setExtractedData(null);
            setError(null);
        } else {
            setError('Please select a valid PDF file');
            setFile(null);
        }
    };

    // Handle successful PDF document loading
    const onDocumentLoadSuccess = ({ numPages }) => {
        setNumPages(numPages);
        setPageText([]);
        setIsLoading(true);
    };

    // Extract text content from each page
    const onPageLoadSuccess = async (page, pageIndex) => {
        try {
            const textContent = await page.getTextContent();
            const pageTextItems = textContent.items.map(item => item.str);
            const text = pageTextItems.join(' ');

            // Shallow copy and update
            setPageText(prevPageText => {
                const newPageText = [...prevPageText];
                newPageText[pageIndex] = text;
                return newPageText;
            });

            // Loaded all pages
            if (pageIndex === numPages - 1) {
                setTimeout(() => {
                    processExtractedText();
                    setIsLoading(false);
                }, 500);
            }
        } catch (err) {
            setError('Error extracting text from PDF: ' + err.message);
            setIsLoading(false);
        }
    };

    // Process the extracted text
    const processExtractedText = () => {
        const fullText = pageText.join(' ');

        try {
            // Extract customer name
            const nameRegex = /([A-Z]+\s+[A-Z]\.\s+[A-Z]+)/;
            const nameMatch = fullText.match(nameRegex);
            const customerName = nameMatch ? nameMatch[1].trim() : 'Not found';

            // Extract address
            const addressLineRegex = /(\d+\s+[A-Z]+\s+[\r\n\s]+[A-Z]+\s+,\s+USA\s+\d{5})/;
            const addressMatch = fullText.match(addressLineRegex);
            const address = addressMatch ? addressMatch[1].replace(/\s+/g, ' ').trim() : 'Not found';

            // Extract account number
            const accountNumberRegex = /(?:Account\s+#|#|Account\s*#?\s*)(\d{8})/i;
            const accountMatch = fullText.match(accountNumberRegex);
            const accountNumber = accountMatch ? accountMatch[1] : 'Not found';

            // Extract total deposits from summary section
            const depositsRegex = /\+\s*Deposits\s+and\s+other\s+credits\s+\$([0-9,]+\.[0-9]{2})/i;
            const depositsMatch = fullText.match(depositsRegex);
            const totalDeposits = depositsMatch ? depositsMatch[1].replace(/,/g, '') : 'Not found';





            // // Extract beginning balance
            // const beginningBalanceRegex = /Beginning\s+balance\s+on\s+[A-Za-z]+\s+\d+\s+\$(\d+\.\d+)/i;
            // const beginningBalanceMatch = fullText.match(beginningBalanceRegex);
            // const beginningBalance = beginningBalanceMatch ? beginningBalanceMatch[1] : 'Not found';

            // // Extract ending balance
            // const endingBalanceRegex = /Ending\s+balance\s+on\s+[A-Za-z]+\s+\d+\s+\$(\d+\.\d+)/i;
            // const endingBalanceMatch = fullText.match(endingBalanceRegex);
            // const endingBalance = endingBalanceMatch ? endingBalanceMatch[1] : 'Not found';





            // All transactions
            const transactions = [];

            // Match transaction lines with Date, Description, and Amount
            const transactionRegex = /(\d{2}\/\d{2}|\d{4})\s+([A-Z\s]+(?:PURCHASE|WITHDRAWAL|CHECK|CREDIT|CHARGE)[^\n]*?)\s+(?:(\d+\.\d{2})|)\s+(?:(\d+\.\d{2})|)\s+(\d+\.\d{2})/g;
            let transMatch;

            while ((transMatch = transactionRegex.exec(fullText)) !== null) {
                const date = transMatch[1];
                const description = transMatch[2].trim();
                const amount = transMatch[3];

                transactions.push({
                    date,
                    description,
                    amount
                });
            }

            // Calculate total ATM withdrawals
            const atmWithdrawals = transactions.filter(t =>
                t.description.toUpperCase().includes('ATM') &&
                t.description.toUpperCase().includes('WITHDRAWAL')
            );

            const totalAtmWithdrawals = atmWithdrawals.reduce(
                (sum, t) => sum + parseFloat(t.amount),
                0
            ).toFixed(2);

            // Extract Walmart purchases
            const walmartRegex = /POS\s+PURCHASE.*?(?:WAL[\s-]*MART).*?(\d+\.\d{2})/i;
            const walmartPurchases = [];
            let walmartMatch;

            while ((walmartMatch = walmartRegex.exec(fullText)) !== null) {
                // Look for nearby date information
                const dateContext = fullText.substring(Math.max(0, walmartMatch.index - 50), walmartMatch.index);
                const dateMatch = dateContext.match(/(\d{1,2}\/\d{1,2})/);

                walmartPurchases.push({
                    date: dateMatch ? dateMatch[1] : 'Unknown date',
                    description: `${walmartMatch[1]} Purchase`,
                    amount: walmartMatch[2]
                });
            }

            // Set the extracted data in state with additional information
            setExtractedData({
                customerName,
                address,
                accountNumber,
                totalDeposits,
                totalAtmWithdrawals,
                walmartPurchases,
                transactions: transactions.slice(0, 10) // Keep only first 10 for display purposes
            });
        } catch (err) {
            setError('Error processing text: ' + err.message);
        }
    };

    return (
        <div className="bank-statement-extractor">
            <h1>Bank Statement Extractor</h1>

            {/* File upload section */}
            <div className="upload-section">
                <input
                    type="file"
                    id="pdf-upload"
                    onChange={handleFileChange}
                    accept="application/pdf"
                />
                <label htmlFor="pdf-upload">Upload Bank Statement (PDF)</label>
            </div>

            {/* Error and loading states */}
            {error && <div className="error-message">{error}</div>}
            {isLoading && <div className="loading">Processing PDF...</div>}

            {/* Results display */}
            {extractedData && !isLoading && (
                <div className="results">
                    <h2>Extracted Information</h2>

                    <div className="info-grid">
                        <div className="info-card">
                            <h3>Account Details</h3>
                            <p>Name: {extractedData.customerName}</p>
                            <p>Account #: {extractedData.accountNumber}</p>
                            <p>Address: {extractedData.address}</p>
                        </div>

                        <div className="info-card">
                            <h3>Summary</h3>
                            <p>Total Deposits: ${extractedData.totalDeposits}</p>
                            <p>ATM Withdrawals: ${extractedData.totalAtmWithdrawals}</p>
                            <p>Walmart Purchases: {extractedData.walmartPurchases.length}</p>
                        </div>
                    </div>

                    {/* Transactions Table */}
                    <h3>Recent Transactions</h3>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Description</th>
                                    <th>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {extractedData.transactions.map((transaction, index) => (
                                    <tr key={index}>
                                        <td>{transaction.date}</td>
                                        <td>{transaction.description}</td>
                                        <td>${transaction.amount}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* PDF Preview - Simplified, shows only first page */}
            {file && !isLoading && (
                <div className="pdf-preview">
                    <h3>PDF Preview (Page 1)</h3>
                    <Document
                        file={file}
                        onLoadSuccess={onDocumentLoadSuccess}
                        onLoadError={(error) => setError('Error loading PDF: ' + error.message)}
                    >
                        <Page
                            pageNumber={1}
                            onLoadSuccess={(page) => onPageLoadSuccess(page, 0)}
                            width={400}
                        />
                    </Document>
                </div>
            )}
        </div>
    );
}

export default BankStatementExtractor;