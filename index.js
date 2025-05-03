const {google} = require('googleapis');
const fs = require('fs');
const axios = require('axios');
const { JSDOM } = require('jsdom');


// 서비스 계정 키 경로
const CREDENTIALS_PATH = './credentials.json';

// 구글 시트 ID (URL에서 확인 가능)
const SPREADSHEET_ID = '1ScDJjORTZKqrsCk4saBHTcrcwB11jp6HpsSln64LXI0';
const SPREADSHEET_NAME = '시트1';

const BASE_URL = 'https://www.gokams.or.kr/02_apply/';
const URL_PARAMS = 'introduction.aspx?division=&txtKeyword=&ddlKeyfield=45&page=1';

async function fetchAndParse() {
  try {
    // HTML 요청
    const response = await axios.get(`${BASE_URL}${URL_PARAMS}`);
    if(!response){
      throw new Error('axios 응답 없음');
    }
    const dom = new JSDOM(response.data);
    const document = dom.window.document;

    // 게시물 테이블 선택
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

      results.push(post);
    });

    return results;
  } catch (err) {
    console.error('Error fetching data:', err.message);
  }
}


async function appendToSheet(data) {
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SPREADSHEET_NAME}!A1`, // 시트명!시작셀 
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    resource: {
      values: data,
    },
  });

  console.log('✅ 스프레드시트에 데이터 추가 완료');
}

(async () => {
  try {
    const data = await fetchAndParse();
    const sheetValues = [
      ['타임스탬프', '번호', '상태', '제목', '접수마감일', '선정결과일', '첨부파일', 'URL'], // 헤더
      ...data.map(item => [
        new Date().toLocaleString(),
        item.number,
        item.status,
        item.title,
        item.deadline,
        item.selectedDate,
        item.file,
        item.url
      ])
    ];
    await appendToSheet(sheetValues);
  } catch (err) {
    console.error('❌ 에러 발생:', err.message);
  }
})();