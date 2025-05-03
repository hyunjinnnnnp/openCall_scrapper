require('dotenv').config();
const nodemailer = require('nodemailer');
const fs = require('fs'); // credential.json 불러오기 위함
const { google } = require('googleapis');
const axios = require('axios');
const { JSDOM } = require('jsdom');

const CREDENTIALS_PATH = './credentials.json';
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SPREADSHEET_NAME = '시트1';
const ERROR_SHEET_NAME = '시트2';  // 에러 기록용 시트 이름
const BASE_URL = 'https://www.gokams.or.kr/02_apply/';
const URL_PARAMS = 'introduction.aspx?division=&txtKeyword=&ddlKeyfield=45&page=1';

async function fetchAndParse() {
  try {
    const response = await axios.get(`${BASE_URL}${URL_PARAMS}`);
    if(!response){
      throw new Error('axios 응답 없음');
    }
    const dom = new JSDOM(response.data);
    const document = dom.window.document;
    const table = document.querySelector('.boardList');
    const rows = table.querySelectorAll('tbody tr');

    const results = [];

    rows.forEach(row => {
      const columns = row.querySelectorAll('td');
      if (columns.length < 6) return;

      const post = {
        number: columns[0].textContent.trim(),
        status: row.querySelector('img')?.alt || null,
        title: columns[2].textContent.trim(),
        deadline: columns[3].textContent.trim(),
        selectedDate: columns[4].textContent.trim(),
        file: columns[5].textContent.trim(),
        url: `${BASE_URL}/${row.querySelector('a')?.href || null}`
      };
      console.log('🔎 Post parsed:', post);

      results.push(post);
    });

    return results;
  } catch (err) {
    console.error('❌ fetchAndParse 오류:', err.message);
    throw new Error('fetchAndParse 오류');
  }
}

async function getExistingTitles(auth) {
  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SPREADSHEET_NAME}!D2:D`, // D열 = 제목
    });
    return res.data.values?.flat() || [];
  } catch (err) {
    console.error('❌ getExistingTitles 오류:', err.message);
    throw new Error('getExistingTitles 오류');
  }
}

async function appendToSheet(auth, newPosts) {
  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const now = new Date().toISOString(); // YYYY-MM-DDTHH:mm:ss.sssZ

    const header = [
      ['등록일', '번호', '상태', '제목', '접수마감', '선정결과발표', '첨부파일', '링크']
    ];

    const rows = newPosts.map(post => [
      now,  
      post.number,
      post.status,
      post.title,
      post.deadline,
      post.selectedDate,
      post.file,
      post.url
    ]);
    
    const allRows = [...header, ...rows];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SPREADSHEET_NAME}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: { values: allRows }
    });

    console.log(`✅ ${rows.length}개 새 항목 추가 완료`);
  } catch (err) {
    console.error('❌ appendToSheet 오류:', err.message);
    throw new Error('appendToSheet 오류');
  }
}

async function sendEmail(newPosts) {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_SENDER,
        pass: process.env.EMAIL_PASSWORD
      }
    });
    // 연결 검증
transporter.verify((error, success) => {
  if (error) {
    console.error('SMTP 연결 실패:', error);
    throw new Error('SMTP 연결 오류: ' + error.message);
  } else {
    console.log('SMTP 연결 성공:', success);
  }
});

    const body = newPosts.map(p => `📌 ${p.title}\n${p.url}`).join('\n\n');

    await transporter.sendMail({
      from: `"공모스크래퍼" <${process.env.EMAIL_SENDER}>`,
      to: process.env.EMAIL_RECEIVER,
      subject: `[새 공모 ${newPosts.length}건] 예술경영지원센터`,
      text: body
    });

    console.log('📧 이메일 전송 완료');
  } catch (err) {
    console.error('❌ sendEmail 오류:', err.message);
    throw new Error('sendEmail 오류');
  }
}

async function logErrorToSheet(auth, errorMessage) {
  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const errorRows = [
      [new Date().toLocaleString(), errorMessage]
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${ERROR_SHEET_NAME}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: { values: errorRows }
    });

    console.log('❌ 에러 로그 시트2에 기록 완료');
  } catch (err) {
    console.error('❌ logErrorToSheet 오류:', err.message);
  }
}

(async () => {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: CREDENTIALS_PATH,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const client = await auth.getClient();
    if(!client){
      throw new Error('구글 auth 실패: 클라이언트 정보를 찾을 수 없음')
    }
    const data = await fetchAndParse();
    const existingTitles = await getExistingTitles(client);
    const newPosts = data.filter(p => !existingTitles.includes(p.title));

    if (newPosts.length > 0) {
      await appendToSheet(client, newPosts);
      await sendEmail(newPosts);
    } else {
      console.log('🟡 새 항목 없음');
    }
  } catch (err) {
    console.error('❌ 최종 오류:', err.message);
    const auth = new google.auth.GoogleAuth({
      keyFile: CREDENTIALS_PATH,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const client = await auth.getClient();
    await logErrorToSheet(client, err.message);
  }
})();
