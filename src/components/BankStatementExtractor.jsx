// Author: Francis Deng
// Version: 1.0

import React, { useState, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist'; // Version 3.11.174
import Tesseract from 'tesseract.js';
import './BankStatementExtractor.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

function BankStatementExtractor() {
    // State variables
    const [extractedData, setExtractedData] = useState(null);
    const [numPages, setNumPages] = useState(null);
    const [processedPages, setProcessedPages] = useState(0);
    const [pageText, setPageText] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    // Handle file upload
    const handleFileChange = (event) => {
        const selectedFile = event.target.files[0];
        if (selectedFile && selectedFile.type === 'application/pdf') {
            setIsLoading(true);
            loadPdf(selectedFile)
            setPageText([]);
            setExtractedData(null);
            setProcessedPages(0);
            setError(null);
        } else {
            setError('Please select a valid PDF file');
        }
    };

    // Load the PDF document
    const loadPdf = async (file) => {
        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const pdfData = new Uint8Array(e.target.result);
                const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
                setNumPages(pdf.numPages);

                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    await extractTextWithOCR(page, i - 1);
                }
            };
            reader.readAsArrayBuffer(file);
        } catch (err) {
            setError('Error loading PDF: ' + err.message);
            setIsLoading(false);
        }
    };

    // Extract text from each page using OCR
    const extractTextWithOCR = async (page, pageIndex) => {
        try {
            const viewport = page.getViewport({ scale: 6 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };
            await page.render(renderContext).promise;

            const { data: { text: ocrText } } = await Tesseract.recognize(canvas, 'eng');

            setPageText(prevPageText => {
                const newPageText = [...prevPageText];
                newPageText[pageIndex] = ocrText;
                return newPageText;
            });

            setProcessedPages(prev => prev + 1);
        } catch (err) {
            setError('Error extracting text with OCR: ' + err.message);
        }
    };

    // Making sure all pages are processed before extraction
    useEffect(() => {
        if (processedPages === numPages && numPages > 0) {
            processExtractedText();
            setIsLoading(false);
        }
    }, [processedPages, numPages]);





    // Extract all transactions by date
    const parseTransactions = (text) => {
        const transactionSection = text.match(/Account Transactions by date[\s\S]*?(?=Account Transactions by type|$)/);

        const transactionTypeSection = text.match(/Account Transactions by type[\s\S]*?(?=Checks Paid|$)/);

        if (!transactionSection || !transactionTypeSection) {
            return [];
        }

        const lines = transactionSection[0].split('\n');
        const typeLines = transactionTypeSection[0].split('\n');
        const transactionMap = new Map();

        // Helper Function
        const parseLine = (line, isTypeSection = false) => {
            const regex = isTypeSection
                ? /(\d{2}\/\d{2})\s+(.*?)\s+(-?\d*\.?\d{1,2})$/
                : /(\d{2}\/\d{2})\s+(.*?)\s+(-?\d*\.?\d{1,2})\s+(-?\d*\.?\d{1,2})$/;

            const match = line.match(regex);
            if (match) {
                const [_, date, rawDescription, amount, balance] = match;
                const description = rawDescription.trim();
                const isCredit = /CREDIT|INTEREST|DEPOSIT/i.test(description);
                const balanceValue = balance ? parseFloat(balance) : null;
                const amountValue = isCredit ? -parseFloat(amount) : parseFloat(amount);

                const transactionKey = `${date}-${amountValue.toFixed(2)}`;
                if (isTypeSection) {
                    if (transactionMap.has(transactionKey)) {
                        console.log(transactionKey)
                        const existingTransaction = transactionMap.get(transactionKey);
                        existingTransaction.description = `${description}`;
                    }
                } else {
                    if (!transactionMap.has(transactionKey)) {
                        transactionMap.set(transactionKey, {
                            date,
                            description,
                            amountValue,
                            balanceValue,
                        });
                    }
                }
            }
        };

        for (const line of lines) {
            if (!line.trim() || line.includes('Date Description') ||
                line.includes('Activity for Relationship') || line.includes('Account Transactions by date')) {
                continue;
            }
            parseLine(line);
        }

        for (const line of typeLines) {
            if (!line.trim() || line.includes('Date Description') ||
                line.includes('Deposits and Other Credits') || line.includes('Withdrawals and Other Debits') || line.includes('Check Images for Relationship Checking')) {
                continue;
            }
            parseLine(line, true);
        }

        return Array.from(transactionMap.values());
    };


    // Process the extracted text
    const processExtractedText = () => {
        const fullText = pageText.join(' ');
        try {
            // All Transactions
            const transactions = parseTransactions(fullText);

            // Name
            const nameMatch = fullText.match(/([A-Z]+\s+[A-Z]\.\s+[A-Z]+)/);
            const customerName = nameMatch ? nameMatch[1].trim() : 'Not found';
            // Account Number
            const accountMatch = fullText.match(/Account\s+#\s*(\d+)/i);
            const accountNumber = accountMatch ? accountMatch[1] : 'Not found';
            // Address
            const addressMatch = fullText.match(/(\d+\s+[A-Z]+\s+DRIVE[\r\n\s]+[A-Z]+\s+CITY,\s+USA\s+\d{5})/);
            const address = addressMatch ? addressMatch[1]
                .replace(/[\r\n]+/g, ', ')
                .replace(/\s+/g, ' ')
                .trim()
                : 'Not found';

            // Total Deposits
            const depositsMatch = fullText.match(/Deposits and other credits\s+\$([\d,]+\.\d{2})/);
            const totalDeposits = depositsMatch ? parseFloat(depositsMatch[1].replace(/,/g, '')) : 0;

            // ATM Withdrawals
            const totalATMWithdrawals = transactions
                .filter(transaction => /ATM WITHDRAWAL/i.test(transaction.description))
                .reduce((sum, transaction) => sum + transaction.amountValue, 0);

            // Walmart Purchases
            const walmartPurchases = transactions.filter(transaction =>
                /WAL-MART/i.test(transaction.description));


            // Set extracted data
            setExtractedData({
                customerName,
                address,
                accountNumber,
                totalDeposits,
                totalATMWithdrawals,
                walmartPurchases,
                transactions,
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
            {/* Loading indicator */}
            {isLoading && (
                <div className="loading-indicator">
                    <div className="spinner"></div>
                    <p>Processing PDF... Please wait.</p>
                </div>
            )}
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
                            <p>ATM Withdrawals: ${extractedData.totalATMWithdrawals}</p>
                        </div>
                    </div>
                    {/* Walmart Transactions Table */}
                    <h3>Walmart Transactions</h3>
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
                                {extractedData.walmartPurchases.map((transaction, index) => (
                                    <tr key={index}>
                                        <td>{transaction.date}</td>
                                        <td>{transaction.description}</td>
                                        <td>${transaction.amountValue}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
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
                                        <td>${transaction.amountValue}</td>
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