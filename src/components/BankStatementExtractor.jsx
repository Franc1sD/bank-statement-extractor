import React, { useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist'; // Version 3.11.174
import Tesseract from 'tesseract.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

function BankStatementExtractor() {
    // State variables
    const [extractedData, setExtractedData] = useState(null);
    const [pageText, setPageText] = useState([]);
    const [error, setError] = useState(null);

    // Handle file upload
    const handleFileChange = (event) => {
        const selectedFile = event.target.files[0];
        if (selectedFile && selectedFile.type === 'application/pdf') {
            setPageText([]);
            setExtractedData(null);
            setError(null);
            loadPdf(selectedFile)
        } else {
            setError('Please select a valid PDF file');
        }
    };

    // Load the PDF document
    const loadPdf = async(file) => {
        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const pdfData = new Uint8Array(e.target.result);
                const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    await extractTextWithOCR(page, i - 1);
                }
                processExtractedText();
            };
            reader.readAsArrayBuffer(file);
        } catch (err) {
            setError('Error loading PDF: ' + err.message);
        }
    };

    // Extract text from each page using OCR
    const extractTextWithOCR = async (page, pageIndex) => {
        try {
            const viewport = page.getViewport({ scale: 2 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };
            await page.render(renderContext).promise;

            const{ data: {text: ocrText } } = await Tesseract.recognize(canvas, 'eng');
            console.log(`OCR text extracted from page ${pageIndex + 1}:`, ocrText);

            setPageText(prevPageText => {
                const newPageText = [...prevPageText];
                newPageText[pageIndex] = ocrText;
                return newPageText;
            });
        } catch (err) {
            setError('Error extracting text with OCR: ' + err.message);
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

            // Extract transactions
            const transactions = [];
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



            // // Extract beginning balance
            // const beginningBalanceRegex = /Beginning\s+balance\s+on\s+[A-Za-z]+\s+\d+\s+\$(\d+\.\d+)/i;
            // const beginningBalanceMatch = fullText.match(beginningBalanceRegex);
            // const beginningBalance = beginningBalanceMatch ? beginningBalanceMatch[1] : 'Not found';

            // // Extract ending balance
            // const endingBalanceRegex = /Ending\s+balance\s+on\s+[A-Za-z]+\s+\d+\s+\$(\d+\.\d+)/i;
            // const endingBalanceMatch = fullText.match(endingBalanceRegex);
            // const endingBalance = endingBalanceMatch ? endingBalanceMatch[1] : 'Not found';





            

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
            {/* Results display */}
            {extractedData && (
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
        </div>
    );
};


export default BankStatementExtractor;